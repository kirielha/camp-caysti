import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { repo } from '../../data'
import { useCamp } from '../../contexte'
import { traduire } from '../../i18n/textes'
import type { LigneClassement, Progression, SessionPourEleve, Tentative } from '../../types'

interface Etat { tentative: Tentative; en_attente: number }

export function Resultat() {
  const { sessionId = '' } = useParams()
  const { eleve, langue, t } = useCamp()
  const location = useLocation()
  const [etat, setEtat] = useState<Etat | undefined>(location.state as Etat | undefined)
  const [detail, setDetail] = useState<SessionPourEleve>()
  const [top, setTop] = useState<LigneClassement[]>()
  const [progression, setProgression] = useState<Progression>({})

  useEffect(() => {
    if (!eleve) return
    repo.chargerSession(sessionId).then(({ detail }) => setDetail(detail))
    repo.tentativeDe(sessionId, eleve.id).then((r) => r && setEtat(r))
    repo.classement(sessionId, 10).then(setTop)
    repo.progression(sessionId, eleve.id).then(setProgression)
  }, [sessionId, eleve])

  if (!eleve || !detail || !etat) return <p className="aide">{t.chargement}</p>

  const satisfaction = detail.fiche.type === 'satisfaction'
  const { tentative, en_attente } = etat
  const dansTop = top?.some((l) => l.eleve_id === eleve.id)
  const { pretest, posttest } = progression
  const ecart = detail.fiche.type === 'posttest' && pretest && posttest ? posttest.score - pretest.score : undefined

  return (
    <section className="resultat">
      <p className="resultat-contexte">
        <span className={`etiquette-type etiquette-${detail.fiche.type}`}>{t.typeFiche[detail.fiche.type]}</span>
        <span>{traduire(detail.atelier, 'titre', langue)}</span>
      </p>
      {satisfaction ? (
        <h1 className="titre-xl">{t.merciAvis}</h1>
      ) : (
        <>
          <p className="resultat-bravo">{t.bravo}</p>
          <div className="score" aria-label={`${t.tonScore} : ${tentative.score} ${t.surPoints(tentative.score_max ?? 0)}`}>
            <span className="score-valeur">{(tentative.score ?? 0).toLocaleString(langue === 'en' ? 'en-GB' : 'fr-FR')}</span>
            <span className="score-max">{t.surPoints(tentative.score_max ?? 0)}</span>
          </div>
          {ecart !== undefined && pretest && (
            <p className={`resultat-progression${ecart > 0 ? ' progression-hausse' : ''}`}>
              {t.depuisPretest(ecart)} <span className="aide">({t.typeFiche.pretest} {t.scoreSur(pretest.score, pretest.score_max)})</span>
            </p>
          )}
          {en_attente > 0 && <p className="note">{t.enAttente(en_attente)}</p>}
        </>
      )}

      {detail.session.classement_affiche && top && (
        <div className="classement">
          <h2 className="titre-m">{t.top10}</h2>
          <ol className="classement-liste">
            {top.map((l) => {
              const moi = l.eleve_id === eleve.id
              return (
                <li key={l.eleve_id} className={`classement-ligne${moi ? ' classement-moi' : ''}${l.rang <= 3 ? ` podium-${l.rang}` : ''}`}>
                  <span className="classement-rang">{l.rang}</span>
                  <span className="classement-nom">{l.nom_affiche}</span>
                  <span className="classement-score">{t.points(l.score)}</span>
                  <span className="classement-temps">{t.minutes(l.temps_total_ms)}</span>
                </li>
              )
            })}
          </ol>
          <p className="aide">{t.egaliteRegle}</p>
          {!dansTop && detail.fiche.type === 'pretest' && <p className="note">{t.pasDansTop}</p>}
        </div>
      )}

      <Link className="bouton bouton-large" to="/eleve">{t.retourActivites}</Link>
    </section>
  )
}
