import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChronoPartage } from '../../components/ChronoPartage'
import { repo } from '../../data'
import { ErreurMetier } from '../../data/repository'
import { useCamp } from '../../contexte'
import { traduire } from '../../i18n/textes'
import { estNotee } from '../../lib/scoring'
import type { EtatPilote, LigneClassement, Reponse, Tentative } from '../../types'

/**
 * Écran élève du mode piloté : il suit l'étape décidée par le formateur
 * (attente, question, révélation, classement, fin) au moment où elle change.
 */
export function PassationPilotee({ sessionId }: { sessionId: string }) {
  const { eleve, langue, t } = useCamp()
  const naviguer = useNavigate()
  const [tentative, setTentative] = useState<Tentative>()
  const [etat, setEtat] = useState<EtatPilote>()
  const [maReponse, setMaReponse] = useState<Reponse>()
  const [top, setTop] = useState<LigneClassement[]>([])
  const [monRang, setMonRang] = useState<number>()
  const [erreur, setErreur] = useState<string>()

  // Entrée dans la salle
  useEffect(() => {
    if (!eleve) return
    repo.rejoindreSessionPilotee(sessionId, eleve.id, langue)
      .then(setTentative)
      .catch((e) => {
        if (e instanceof ErreurMetier && e.code === 'session_fermee') naviguer(`/eleve/session/${sessionId}/resultat`, { replace: true })
        else setErreur(e instanceof ErreurMetier && e.code === 'atelier_inactif' ? t.atelierInactif : t.sessionFermee)
      })
    // la langue choisie à l'entrée est celle de la tentative
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, eleve])

  const charger = useCallback(async () => {
    if (!tentative || !eleve) return
    const e = await repo.etatPilote(sessionId)
    setEtat(e)
    setMaReponse(e.reponsesQuestion.find((r) => r.tentative_id === tentative.id))
    if (e.detail.session.etape === 'classement') {
      const tous = await repo.classementEnDirect(sessionId, 1000)
      setTop(tous.slice(0, 10))
      setMonRang(tous.find((l) => l.eleve_id === eleve.id)?.rang)
    }
    if (e.detail.session.etape === 'terminee') naviguer(`/eleve/session/${sessionId}/resultat`, { replace: true })
  }, [sessionId, tentative, eleve, naviguer])

  useEffect(() => {
    if (!tentative) return
    void charger()
    return repo.surveillerSession(sessionId, () => void charger())
  }, [sessionId, tentative, charger])

  if (erreur) {
    return (
      <section>
        <p className="vide">{erreur}</p>
        <Link className="bouton" to="/eleve">{t.retourActivites}</Link>
      </section>
    )
  }
  if (!etat || !tentative) return <p className="aide">{t.chargement}</p>

  const s = etat.detail.session
  const q = etat.index >= 0 ? etat.questions[etat.index] : undefined

  return (
    <section className="pilote-eleve">
      <p className="activite-meta">
        <span className="etiquette-direct">{t.enDirect}</span>
        <span>{traduire(etat.detail.fiche, 'titre', langue)}</span>
      </p>

      {s.etape === 'attente' && (
        <div className="pilote-attente">
          <div className="pulsation" aria-hidden="true" />
          <h1 className="titre-xl">{t.salleAttenteTitre}</h1>
          <p>{t.salleAttente}</p>
          <p className="aide">{t.connectes(etat.participants.length)}</p>
        </div>
      )}

      {q && s.etape === 'question' && s.question_lancee_le && (
        maReponse
          ? <p className="pilote-message">{t.reponseEnvoyee}</p>
          : <QuestionPilotee key={q.id} etat={etat} tentativeId={tentative.id} onEnvoyee={setMaReponse} />
      )}

      {q && s.etape === 'revelation' && <Revelation etat={etat} reponse={maReponse} />}

      {s.etape === 'classement' && (
        <div className="pilote-classement">
          {monRang && <p className="pilote-rang">{t.tonRang(monRang)}</p>}
          <ol className="classement-liste">
            {top.map((l) => (
              <li key={l.eleve_id} className={`classement-ligne${l.eleve_id === eleve?.id ? ' classement-moi' : ''}${l.rang <= 3 ? ` podium-${l.rang}` : ''}`}>
                <span className="classement-rang">{l.rang}</span>
                <span className="classement-nom">{l.nom_affiche}</span>
                <span className="classement-score">{t.points(l.score)}</span>
                <span className="classement-temps">{t.minutes(l.temps_total_ms)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

function QuestionPilotee({ etat, tentativeId, onEnvoyee }: { etat: EtatPilote; tentativeId: string; onEnvoyee: (r: Reponse) => void }) {
  const { langue, t } = useCamp()
  const q = etat.questions[etat.index]
  const s = etat.detail.session
  const [coches, setCoches] = useState<string[]>([])
  const [texte, setTexte] = useState('')
  const [expire, setExpire] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const estQcm = q.type === 'qcm_unique' || q.type === 'qcm_multiple'
  const pret = estQcm ? coches.length > 0 : texte.trim() !== ''

  const envoyer = async () => {
    if (envoi) return
    setEnvoi(true)
    try {
      onEnvoyee(await repo.repondrePilote(tentativeId, q.id, { choix_coches: coches, texte }))
    } catch {
      setExpire(true) // trop tard : le formateur est passé à la suite ou le temps est écoulé
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="question">
      <ChronoPartage lanceeLe={s.question_lancee_le!} duree={q.duree_secondes} libelle={t.secondes} onFin={() => setExpire(true)} />
      <p className="question-numero">{t.question(etat.index + 1, etat.questions.length)}</p>
      <h1 className="enonce">{traduire(q, 'enonce', langue)}</h1>
      {q.image && <figure className="question-illustration"><img src={q.image} alt="" /></figure>}

      {estQcm && (
        <div className={`choix choix-pilotes${q.choix.some((c) => c.image) ? ' choix-illustres' : ''}`} role={q.type === 'qcm_unique' ? 'radiogroup' : 'group'} aria-label={traduire(q, 'enonce', langue)}>
          {q.choix.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role={q.type === 'qcm_unique' ? 'radio' : 'checkbox'}
              aria-checked={coches.includes(c.id)}
              disabled={expire}
              className={`tuile forme-${i % 4}${coches.includes(c.id) ? ' tuile-active' : ''}`}
              onClick={() => setCoches(q.type === 'qcm_unique' ? [c.id] : coches.includes(c.id) ? coches.filter((x) => x !== c.id) : [...coches, c.id])}
            >
              {c.image && <img src={c.image} alt="" className="tuile-image" />}
              <span className="tuile-legende">
                <span className="choix-projete-forme" aria-hidden="true" />
                <span className="tuile-texte">{traduire(c, 'texte', langue)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {q.type === 'echelle' && (
        <div className="echelle" role="radiogroup">
          {['😞', '🙁', '😐', '🙂', '🤩'].map((emoji, i) => (
            <button key={emoji} type="button" role="radio" aria-checked={texte === String(i + 1)} disabled={expire}
              className={`echelle-bouton${texte === String(i + 1) ? ' tuile-active' : ''}`} onClick={() => setTexte(String(i + 1))}>
              <span className="echelle-emoji" aria-hidden="true">{emoji}</span><span>{t.echelle[i]}</span>
            </button>
          ))}
        </div>
      )}
      {(q.type === 'qro_ia' || q.type === 'qro_qualitative') && (
        <textarea className="champ-texte" rows={4} value={texte} placeholder={t.ecrisTaReponse} disabled={expire} onChange={(e) => setTexte(e.target.value)} aria-label={traduire(q, 'enonce', langue)} />
      )}

      {expire
        ? <p className="temps-ecoule" role="alert">{t.tempsEcoule}</p>
        : <button type="button" className="bouton bouton-principal bouton-large" disabled={!pret || envoi} onClick={envoyer}>{t.valider}</button>}
    </div>
  )
}

function Revelation({ etat, reponse }: { etat: EtatPilote; reponse?: Reponse }) {
  const { langue, t } = useCamp()
  const q = etat.questions[etat.index]
  const bonnes = q.choix.filter((c) => c.est_correct).map((c) => traduire(c, 'texte', langue)).join(', ')

  if (!estNotee(q.type)) return <p className="pilote-message">{reponse ? t.merciReponse : t.pasRepondu}</p>
  if (q.type === 'qro_ia') return <p className="pilote-message">{reponse ? t.reponseEcriteEnregistree : t.pasRepondu}</p>

  const score = reponse?.score_final ?? 0
  const juste = score >= q.points
  return (
    <div className={`pilote-revelation ${juste ? 'pilote-juste' : 'pilote-faux'}`} role="status">
      <p className="pilote-verdict">{!reponse ? t.pasRepondu : juste ? t.bonneReponse : score > 0 ? t.partiellement : t.rate}</p>
      {score > 0 && <p className="pilote-points">{t.plusPoints(score)}</p>}
      {!juste && <p>{t.laBonneReponse(bonnes)}</p>}
      <p className="aide">{t.regardeEcran}</p>
    </div>
  )
}
