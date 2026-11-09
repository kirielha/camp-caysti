import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { repo } from '../../data'
import { useCamp } from '../../contexte'
import { traduire } from '../../i18n/textes'
import { BlocCode } from '../../components/BlocCode'
import type { AtelierPourEleve, PartieAvecRessources, SessionPourEleve } from '../../types'

type AtelierAffiche = AtelierPourEleve & { nbQuestions: Record<string, number> }

export function Accueil() {
  const { eleve, t, deconnecter } = useCamp()
  const [ateliers, setAteliers] = useState<AtelierAffiche[]>()
  const naviguer = useNavigate()

  const charger = useCallback(async () => {
    if (!eleve) return
    const liste = await repo.ateliersPourEleve(eleve.id)
    const complets = await Promise.all(
      liste.map(async (a) => {
        const nbQuestions: Record<string, number> = {}
        for (const s of a.activites) {
          nbQuestions[s.session.id] = s.nb_questions ?? (await repo.chargerSession(s.session.id)).questions.length
        }
        return { ...a, nbQuestions }
      }),
    )
    setAteliers(complets)
  }, [eleve])

  useEffect(() => {
    void charger()
    // Le formateur peut démarrer un atelier ou ouvrir une activité pendant que l'élève
    // est sur cet écran : on relit l'état régulièrement et au retour sur l'onglet.
    const id = setInterval(() => void charger(), 15_000)
    const auRetour = () => { if (document.visibilityState === 'visible') void charger() }
    document.addEventListener('visibilitychange', auRetour)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', auRetour) }
  }, [charger])

  if (!eleve) return null

  return (
    <section>
      <h1 className="titre-xl">{t.bonjour(eleve.prenom)}</h1>
      <p className="aide">{ateliers ? t.tesAteliers(ateliers.length) : t.chargement}</p>

      {ateliers?.length === 0 && <p className="vide">{t.aucunAtelier}</p>}

      <div className="ateliers">
        {ateliers?.map((a) => <BlocAtelier key={a.groupe.id} a={a} />)}
      </div>

      <button type="button" className="lien lien-discret" onClick={() => { deconnecter(); naviguer('/') }}>
        {t.deconnexion}
      </button>
    </section>
  )
}

function BlocAtelier({ a }: { a: AtelierAffiche }) {
  const { langue, t } = useCamp()
  const statut = a.groupe.statut

  return (
    <article className={`atelier atelier-${statut}`} style={{ ['--techno' as string]: a.technologie.couleur }}>
      <header className="atelier-entete">
        {a.atelier.image && <img className="atelier-image" src={a.atelier.image} alt="" />}
        <p className="atelier-horaire">
          <span className={`etiquette-statut etiquette-statut-${statut}`}>{t.statutAtelier[statut]}</span>
          <span className="atelier-heure">{t.jour(a.groupe.date)}, {a.groupe.heure_debut}–{a.groupe.heure_fin}</span>
          <span>{[a.groupe.salle, a.groupe.nom].filter(Boolean).join(', ')}</span>
        </p>
        <h2 className="atelier-titre">{traduire(a.atelier, 'titre', langue)}</h2>
        <p className="atelier-techno">{traduire(a.technologie, 'nom', langue)}</p>
      </header>

      {statut === 'a_venir' && <p className="atelier-message">{t.atelierPasCommence(a.groupe.heure_debut)}</p>}
      {statut === 'termine' && <p className="atelier-message">{t.atelierTermine}</p>}

      {a.activites.length === 0 && !a.parties?.length ? (
        <p className="aide atelier-vide">{t.aucuneActivite}</p>
      ) : (
        <>
          {(a.parties ?? []).map((p, i) => (
            <SectionPartie key={p.partie.id} p={p} numero={i + 1} a={a}
              activites={a.activites.filter((s) => s.session.partie_id === p.partie.id)} />
          ))}
          {sansPartie(a).length > 0 && (
            <section className="partie">
              {(a.parties ?? []).length > 0 && <h3 className="partie-titre">{t.autresActivites}</h3>}
              <Progression activites={sansPartie(a)} />
              <ul className="activites">
                {sansPartie(a).map((s) => <Activite key={s.session.id} s={s} a={a} nb={a.nbQuestions[s.session.id] ?? 0} />)}
              </ul>
            </section>
          )}
        </>
      )}
    </article>
  )
}

const sansPartie = (a: AtelierPourEleve) => {
  const ids = new Set((a.parties ?? []).map((p) => p.partie.id))
  return a.activites.filter((s) => !s.session.partie_id || !ids.has(s.session.partie_id))
}

function SectionPartie({ p, numero, a, activites }: { p: PartieAvecRessources; numero: number; a: AtelierAffiche; activites: SessionPourEleve[] }) {
  const { langue, t } = useCamp()
  return (
    <section className="partie">
      <h3 className="partie-titre"><span className="partie-numero">{t.partie(numero)}</span> {traduire(p.partie, 'titre', langue)}</h3>
      <Progression activites={activites} />
      {activites.length > 0 && (
        <ul className="activites">
          {activites.map((s) => <Activite key={s.session.id} s={s} a={a} nb={a.nbQuestions[s.session.id] ?? 0} />)}
        </ul>
      )}
      {p.ressources.length > 0 && (
        <div className="ressources">
          <p className="ressources-titre">{t.aCopier}</p>
          {p.ressources.map((r) => <BlocCode key={r.id} r={r} libelles={t} />)}
        </div>
      )}
    </section>
  )
}

function Activite({ s, a, nb }: { s: SessionPourEleve; a: AtelierAffiche; nb: number }) {
  const { langue, t } = useCamp()
  const fait = s.tentative && s.tentative.statut !== 'en_cours'
  const enCours = s.tentative?.statut === 'en_cours'
  const note = s.fiche.type !== 'satisfaction'
  const groupe = a.groupe.statut

  // Raison pour laquelle l'activité n'est pas accessible (undefined = accessible)
  const blocage = fait
    ? undefined
    : groupe === 'a_venir' ? t.commenceA(a.groupe.heure_debut)
    : groupe === 'termine' ? t.statutAtelier.termine
    : s.session.statut === 'brouillon' ? t.pasEncoreOuvert
    : s.session.statut === 'fermee' ? t.activiteFermee
    : undefined

  return (
    <li className={`activite${fait ? ' activite-faite' : ''}${blocage ? ' activite-bloquee' : ''}`}>
      <div className="activite-texte">
        <p className="activite-meta">
          <span className={`etiquette-type etiquette-${s.fiche.type}`}>{t.typeFiche[s.fiche.type]}</span>
          {s.session.mode === 'pilote' && <span className="etiquette-direct">{t.enDirect}</span>}
        </p>
        <h3>{traduire(s.fiche, 'titre', langue)}</h3>
        <p className="aide">{t.nbQuestions(nb)}</p>
      </div>
      {fait ? (
        <div className="activite-actions">
          {note
            ? <span className="activite-score">{t.scoreSur(s.tentative?.score ?? 0, s.tentative?.score_max ?? 0)}</span>
            : <span className="etiquette-fait">{t.termine}</span>}
          {s.session.classement_affiche && (
            <Link className="lien" to={`/eleve/session/${s.session.id}/resultat`}>{t.voirClassement}</Link>
          )}
        </div>
      ) : blocage ? (
        <div className="activite-actions">
          <button type="button" className="bouton bouton-principal" disabled aria-describedby={`blocage-${s.session.id}`}>
            {t.commencer}
          </button>
          <span id={`blocage-${s.session.id}`} className="activite-blocage">{blocage}</span>
        </div>
      ) : (
        <Link className="bouton bouton-principal" to={`/eleve/session/${s.session.id}`}>
          {s.session.mode === 'pilote' ? t.rejoindre : enCours ? t.reprendre : t.commencer}
        </Link>
      )}
    </li>
  )
}

/** Bandeau de progression d'une partie, affiché dès que prétest et post-test sont passés. */
function Progression({ activites }: { activites: SessionPourEleve[] }) {
  const { t } = useCamp()
  const res = (type: 'pretest' | 'posttest') => {
    const tt = activites.find((s) => s.fiche.type === type)?.tentative
    return tt && tt.statut !== 'en_cours' ? tt : undefined
  }
  const pre = res('pretest')
  const post = res('posttest')
  if (!pre || !post) return null
  const ecart = (post.score ?? 0) - (pre.score ?? 0)
  return (
    <p className="progression">
      <span>{t.typeFiche.pretest} {t.scoreSur(pre.score ?? 0, pre.score_max ?? 0)}</span>
      <span aria-hidden="true" className="progression-fleche">›</span>
      <span>{t.typeFiche.posttest} {t.scoreSur(post.score ?? 0, post.score_max ?? 0)}</span>
      <strong className={ecart > 0 ? 'progression-hausse' : undefined}>{t.ecart(ecart)}</strong>
    </p>
  )
}
