import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { repo } from '../../data'
import { ErreurMetier } from '../../data/repository'
import { useCamp } from '../../contexte'
import { traduire } from '../../i18n/textes'
import type { QuestionAvecChoix, SessionPourEleve, Tentative } from '../../types'
import { Chrono } from '../../components/Chrono'

type Phase = 'chargement' | 'consignes' | 'question' | 'envoi' | 'fermee'

export function Passation() {
  const { sessionId = '' } = useParams()
  const { eleve, langue, t } = useCamp()
  const naviguer = useNavigate()

  const [phase, setPhase] = useState<Phase>('chargement')
  const [detail, setDetail] = useState<SessionPourEleve>()
  const [questions, setQuestions] = useState<QuestionAvecChoix[]>([])
  const [tentative, setTentative] = useState<Tentative>()
  const [index, setIndex] = useState(0)
  const [reprise, setReprise] = useState(false)
  const [motifFermeture, setMotifFermeture] = useState<'atelier_inactif' | 'session_fermee'>('session_fermee')

  // Chargement de la session et démarrage (ou reprise) de la tentative
  useEffect(() => {
    if (!eleve) return
    let actif = true
    ;(async () => {
      try {
        const { detail, questions } = await repo.chargerSession(sessionId)
        const { tentative, reponses } = await repo.demarrerTentative(sessionId, eleve.id, langue)
        if (!actif) return
        const repondues = new Set(reponses.map((r) => r.question_id))
        const premiere = questions.findIndex((q) => !repondues.has(q.id))
        setDetail(detail)
        setQuestions(questions)
        setTentative(tentative)
        setReprise(reponses.length > 0)
        setIndex(premiere === -1 ? questions.length : premiere)
        setPhase('consignes')
      } catch (e) {
        if (!actif) return
        if (e instanceof ErreurMetier && e.code === 'deja_soumise') naviguer(`/eleve/session/${sessionId}/resultat`, { replace: true })
        else {
          if (e instanceof ErreurMetier && e.code === 'atelier_inactif') setMotifFermeture('atelier_inactif')
          setPhase('fermee')
        }
      }
    })()
    return () => { actif = false }
    // la langue choisie au démarrage est celle de la tentative ; la changer ensuite ne relance pas le test
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, eleve])

  const terminer = useCallback(async () => {
    if (!tentative) return
    setPhase('envoi')
    const { tentative: finie, en_attente } = await repo.soumettreTentative(tentative.id)
    naviguer(`/eleve/session/${sessionId}/resultat`, { replace: true, state: { tentative: finie, en_attente } })
  }, [tentative, naviguer, sessionId])

  const suivante = useCallback(async () => {
    const prochain = index + 1
    if (prochain >= questions.length) await terminer()
    else setIndex(prochain)
  }, [index, questions.length, terminer])

  if (phase === 'chargement') return <p className="aide">{t.chargement}</p>
  if (phase === 'fermee') {
    return (
      <section>
        <p className="vide">{motifFermeture === 'atelier_inactif' ? t.atelierInactif : t.sessionFermee}</p>
        <Link className="bouton" to="/eleve">{t.retourActivites}</Link>
      </section>
    )
  }
  if (!detail || !tentative) return null

  if (phase === 'consignes') {
    return (
      <section className="consignes">
        <p className="activite-meta"><span className="etiquette-type">{t.typeFiche[detail.fiche.type]}</span></p>
        <h1 className="titre-l">{traduire(detail.fiche, 'titre', langue)}</h1>
        <h2 className="titre-m">{t.avantDeCommencer}</h2>
        <ul className="liste-consignes">
          <li>{t.consigneChrono}</li>
          <li>{t.consigneUneFois}</li>
          {detail.fiche.type !== 'satisfaction' && <li>{t.consigneHonnete}</li>}
        </ul>
        <button
          className="bouton bouton-principal bouton-large"
          onClick={() => (index >= questions.length ? terminer() : setPhase('question'))}
          autoFocus
        >
          {reprise ? t.reprendre : t.jeSuisPret}
        </button>
      </section>
    )
  }

  if (phase === 'envoi') return <p className="aide">{t.chargement}</p>

  const q = questions[index]
  return (
    <EcranQuestion
      key={q.id}
      question={q}
      numero={index + 1}
      total={questions.length}
      tentativeId={tentative.id}
      onSuivante={suivante}
    />
  )
}

// --------------------------------------------------------------------------

interface PropsQuestion {
  question: QuestionAvecChoix
  numero: number
  total: number
  tentativeId: string
  onSuivante: () => void
}

function EcranQuestion({ question: q, numero, total, tentativeId, onSuivante }: PropsQuestion) {
  const { langue, t } = useCamp()
  const [coches, setCoches] = useState<string[]>([])
  const [texte, setTexte] = useState('')
  const [expire, setExpire] = useState(false)
  const debut = useRef(0)
  const enregistre = useRef(false)

  useEffect(() => {
    debut.current = performance.now()
  }, [])

  const estQcm = q.type === 'qcm_unique' || q.type === 'qcm_multiple'
  const aRepondu = estQcm || q.type === 'echelle' ? coches.length > 0 || texte !== '' : texte.trim() !== ''

  const enregistrer = useCallback(async (parExpiration: boolean) => {
    if (enregistre.current) return
    enregistre.current = true
    const temps_ms = parExpiration ? q.duree_secondes * 1000 : performance.now() - debut.current
    await repo.enregistrerReponse(tentativeId, q.id, { choix_coches: coches, texte, temps_ms })
    if (parExpiration) {
      setExpire(true)
      setTimeout(onSuivante, 900)
    } else {
      onSuivante()
    }
  }, [coches, texte, q, tentativeId, onSuivante])

  const basculer = (id: string) => {
    if (expire) return
    if (q.type === 'qcm_unique') setCoches([id])
    else setCoches((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  return (
    <section className="question" aria-labelledby="enonce">
      <Chrono duree={q.duree_secondes} pause={expire} onFin={() => enregistrer(true)} />

      <p className="question-numero">{t.question(numero, total)}</p>
      <h1 id="enonce" className="enonce">{traduire(q, 'enonce', langue)}</h1>
      {q.image && (
        <figure className="question-illustration">
          <img src={q.image} alt="" />
        </figure>
      )}

      {estQcm && (
        <>
          <p className="aide">{q.type === 'qcm_unique' ? t.uneReponse : t.plusieursReponses}</p>
          <div
            className={`choix${q.choix.some((c) => c.image) ? ' choix-illustres' : ''}`}
            role={q.type === 'qcm_unique' ? 'radiogroup' : 'group'}
            aria-labelledby="enonce"
          >
            {q.choix.map((c, i) => {
              const actif = coches.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  role={q.type === 'qcm_unique' ? 'radio' : 'checkbox'}
                  aria-checked={actif}
                  className={`tuile${actif ? ' tuile-active' : ''}`}
                  onClick={() => basculer(c.id)}
                  disabled={expire}
                >
                  {c.image && <img src={c.image} alt="" className="tuile-image" />}
                  <span className="tuile-legende">
                    <span className={`tuile-lettre${q.type === 'qcm_multiple' ? ' tuile-lettre-carree' : ''}`} aria-hidden="true">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="tuile-texte">{traduire(c, 'texte', langue)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {q.type === 'echelle' && (
        <div className="echelle" role="radiogroup" aria-labelledby="enonce">
          {['😞', '🙁', '😐', '🙂', '🤩'].map((emoji, i) => (
            <button
              key={emoji}
              type="button"
              role="radio"
              aria-checked={texte === String(i + 1)}
              className={`echelle-bouton${texte === String(i + 1) ? ' tuile-active' : ''}`}
              onClick={() => setTexte(String(i + 1))}
              disabled={expire}
            >
              <span className="echelle-emoji" aria-hidden="true">{emoji}</span>
              <span>{t.echelle[i]}</span>
            </button>
          ))}
        </div>
      )}

      {(q.type === 'qro_ia' || q.type === 'qro_qualitative') && (
        <textarea
          className="champ-texte"
          rows={5}
          value={texte}
          placeholder={t.ecrisTaReponse}
          onChange={(e) => setTexte(e.target.value)}
          disabled={expire}
          aria-labelledby="enonce"
        />
      )}

      {expire ? (
        <p className="temps-ecoule" role="alert">{t.tempsEcoule}</p>
      ) : (
        <div className="actions-question">
          <button type="button" className="lien" onClick={() => enregistrer(false)}>{t.passer}</button>
          <button type="button" className="bouton bouton-principal" disabled={!aRepondu} onClick={() => enregistrer(false)}>
            {t.valider}
          </button>
        </div>
      )}
    </section>
  )
}
