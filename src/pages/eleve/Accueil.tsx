import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { repo } from '../../data'
import { useCamp } from '../../contexte'
import { traduire } from '../../i18n/textes'
import type { SessionPourEleve } from '../../types'

export function Accueil() {
  const { eleve, langue, t, deconnecter } = useCamp()
  const [sessions, setSessions] = useState<(SessionPourEleve & { nb: number })[]>()
  const naviguer = useNavigate()

  useEffect(() => {
    if (!eleve) return
    let actif = true
    repo.sessionsPourEleve(eleve.id).then(async (liste) => {
      const avecNb = await Promise.all(
        liste.map(async (s) => ({ ...s, nb: (await repo.chargerSession(s.session.id)).questions.length })),
      )
      if (actif) setSessions(avecNb)
    })
    return () => { actif = false }
  }, [eleve])

  if (!eleve) return null

  return (
    <section>
      <h1 className="titre-xl">{t.bonjour(eleve.prenom)}</h1>
      <h2 className="titre-m">{t.tesActivites}</h2>

      {!sessions && <p className="aide">{t.chargement}</p>}
      {sessions?.length === 0 && <p className="vide">{t.aucuneActivite}</p>}

      <ul className="activites">
        {sessions?.map((s) => {
          const fait = s.tentative && s.tentative.statut !== 'en_cours'
          const enCours = s.tentative?.statut === 'en_cours'
          return (
            <li key={s.session.id} className={`activite activite-${s.fiche.type}`} style={{ ['--techno' as string]: s.technologie.couleur }}>
              <div className="activite-texte">
                <p className="activite-meta">
                  <span className="etiquette-type">{t.typeFiche[s.fiche.type]}</span>
                  <span>{traduire(s.technologie, 'nom', langue)}</span>
                </p>
                <h3>{traduire(s.fiche, 'titre', langue)}</h3>
                <p className="aide">{t.nbQuestions(s.nb)}, {s.groupe.nom}</p>
              </div>
              {fait ? (
                <div className="activite-actions">
                  <span className="etiquette-fait">{t.termine}</span>
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
        })}
      </ul>

      <button type="button" className="lien lien-discret" onClick={() => { deconnecter(); naviguer('/') }}>
        {t.deconnexion}
      </button>
    </section>
  )
}
