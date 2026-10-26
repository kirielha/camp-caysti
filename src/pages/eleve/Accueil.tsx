import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { repo } from '../../data'
import { useCamp } from '../../contexte'
import { traduire } from '../../i18n/textes'
import type { AtelierPourEleve, SessionPourEleve } from '../../types'

type AtelierAffiche = AtelierPourEleve & { nbQuestions: Record<string, number> }

export function Accueil() {
  const { eleve, langue, t, deconnecter } = useCamp()
  const [ateliers, setAteliers] = useState<AtelierAffiche[]>()
  const naviguer = useNavigate()

  useEffect(() => {
    if (!eleve) return
    let actif = true
    repo.ateliersPourEleve(eleve.id).then(async (liste) => {
      const complets = await Promise.all(
        liste.map(async (a) => {
          const nbQuestions: Record<string, number> = {}
          for (const s of a.activites) nbQuestions[s.session.id] = (await repo.chargerSession(s.session.id)).questions.length
          return { ...a, nbQuestions }
        }),
      )
      if (actif) setAteliers(complets)
    })
    return () => { actif = false }
  }, [eleve])

  if (!eleve) return null

  return (
    <section>
      <h1 className="titre-xl">{t.bonjour(eleve.prenom)}</h1>
      <p className="aide">{ateliers ? t.tesAteliers(ateliers.length) : t.chargement}</p>

      {ateliers?.length === 0 && <p className="vide">{t.aucunAtelier}</p>}

      <div className="ateliers">
        {ateliers?.map((a) => (
          <article key={a.groupe.id} className="atelier" style={{ ['--techno' as string]: a.technologie.couleur }}>
            <header className="atelier-entete">
              <p className="atelier-horaire">
                <span className="atelier-heure">{t.jour(a.groupe.date)}, {a.groupe.heure_debut}–{a.groupe.heure_fin}</span>
                <span>{[a.groupe.salle, a.groupe.nom].filter(Boolean).join(', ')}</span>
              </p>
              <h2 className="atelier-titre">{traduire(a.atelier, 'titre', langue)}</h2>
              <p className="atelier-techno">{traduire(a.technologie, 'nom', langue)}</p>
            </header>

            <Progression atelier={a} />

            {a.activites.length === 0 ? (
              <p className="aide atelier-vide">{t.aucuneActivite}</p>
            ) : (
              <ul className="activites">
                {a.activites.map((s) => <Activite key={s.session.id} s={s} nb={a.nbQuestions[s.session.id] ?? 0} />)}
              </ul>
            )}
          </article>
        ))}
      </div>

      <button type="button" className="lien lien-discret" onClick={() => { deconnecter(); naviguer('/') }}>
        {t.deconnexion}
      </button>
    </section>
  )
}

function Activite({ s, nb }: { s: SessionPourEleve; nb: number }) {
  const { langue, t } = useCamp()
  const fait = s.tentative && s.tentative.statut !== 'en_cours'
  const enCours = s.tentative?.statut === 'en_cours'
  const note = s.fiche.type !== 'satisfaction'

  return (
    <li className={`activite${fait ? ' activite-faite' : ''}`}>
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
      ) : (
        <Link className="bouton bouton-principal" to={`/eleve/session/${s.session.id}`}>
          {enCours ? t.reprendre : t.commencer}
        </Link>
      )}
    </li>
  )
}

/** Bandeau de progression de l'atelier, affiché dès que le prétest est passé. */
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
