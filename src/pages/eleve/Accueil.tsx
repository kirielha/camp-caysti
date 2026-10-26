import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { repo } from '../../data'
import { useCamp } from '../../contexte'
import { traduire } from '../../i18n/textes'
import type { AtelierPourEleve, SessionPourEleve } from '../../types'

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
        for (const s of a.activites) nbQuestions[s.session.id] = (await repo.chargerSession(s.session.id)).questions.length
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

      <Progression atelier={a} />

      {a.activites.length === 0 ? (
        <p className="aide atelier-vide">{t.aucuneActivite}</p>
      ) : (
        <ul className="activites">
          {a.activites.map((s) => <Activite key={s.session.id} s={s} a={a} nb={a.nbQuestions[s.session.id] ?? 0} />)}
        </ul>
      )}
    </article>
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
        <p className="activite-meta"><span className={`etiquette-type etiquette-${s.fiche.type}`}>{t.typeFiche[s.fiche.type]}</span></p>
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
          {enCours ? t.reprendre : t.commencer}
        </Link>
      )}
    </li>
  )
}

/** Bandeau de progression de l'atelier, affiché dès que prétest et post-test sont passés. */
function Progression({ atelier }: { atelier: AtelierPourEleve }) {
  const { t } = useCamp()
  const res = (type: 'pretest' | 'posttest') => {
    const tt = atelier.activites.find((s) => s.fiche.type === type)?.tentative
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
