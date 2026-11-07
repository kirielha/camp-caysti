import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChronoPartage } from '../components/ChronoPartage'
import { staff } from '../data'
import { DELAI_GRACE_MS } from '../data/localRepository'
import { ErreurDroits, type ActionPilote } from '../data/staffRepository'
import { estNotee } from '../lib/scoring'
import type { EtatPilote, LigneClassement } from '../types'
import { useStaff } from './contexteStaff'
import { libelleType } from './libelles'

const nombre = (n: number) => n.toLocaleString('fr-FR')

/**
 * Écran d'animation du mode piloté, pensé pour être projeté : le formateur lance chaque
 * question, tous les élèves la reçoivent en même temps, puis il révèle la réponse et le classement.
 */
export function AnimationDirect() {
  const { sessionId = '' } = useParams()
  const { moi } = useStaff()
  const [etat, setEtat] = useState<EtatPilote>()
  const [top, setTop] = useState<LigneClassement[]>([])
  const [nbInscrits, setNbInscrits] = useState(0)
  const [atelierEnCours, setAtelierEnCours] = useState(true)
  const [erreur, setErreur] = useState<string>()
  const enAction = useRef(false)

  const charger = useCallback(async () => {
    if (!moi) return
    const e = await staff.etatPilote(sessionId)
    setEtat(e)
    const d = await staff.detailGroupe(e.detail.groupe.id, moi)
    setNbInscrits(d.nb_eleves)
    setAtelierEnCours(d.groupe.statut === 'en_cours')
    if (e.detail.session.etape === 'classement' || e.detail.session.etape === 'terminee' || e.detail.session.etape === 'revelation') {
      setTop(e.detail.session.etape === 'terminee' ? await staff.classement(sessionId, 10) : await staff.classementEnDirect(sessionId, 10))
    }
  }, [sessionId, moi])

  useEffect(() => {
    void charger()
    return staff.surveillerSession(sessionId, () => void charger())
  }, [sessionId, charger])

  const agir = useCallback(async (action: ActionPilote) => {
    if (!moi || enAction.current) return
    enAction.current = true
    setErreur(undefined)
    try { await staff.piloter(sessionId, action, moi) } catch (e) {
      setErreur(e instanceof ErreurDroits ? e.message : 'L’action a échoué.')
    } finally {
      enAction.current = false
    }
  }, [moi, sessionId])

  if (!moi || !etat) return <p className="aide">Chargement…</p>

  const s = etat.detail.session
  const q = etat.index >= 0 ? etat.questions[etat.index] : undefined
  const derniere = etat.index === etat.questions.length - 1
  const nbConnectes = etat.participants.length

  const boutonSuite = derniere
    ? <button type="button" className="bouton bouton-principal" onClick={() => agir('terminer')}>Terminer et voir le classement final</button>
    : <button type="button" className="bouton bouton-principal" onClick={() => agir('suivante')}>Question suivante</button>

  return (
    <section className="animation">
      <div className="animation-barre">
        <Link to={`/formateur/groupe/${etat.detail.groupe.id}`} className="lien">‹ Retour au groupe</Link>
        <span className="aide">{libelleType[etat.detail.fiche.type]} en direct : {etat.detail.fiche.titre_fr}</span>
        <span className="animation-connectes">{nbConnectes}/{nbInscrits} connectés</span>
      </div>
      {erreur && <p className="erreur" role="alert">{erreur}</p>}

      {/* ---------- Salle d'attente ---------- */}
      {s.etape === 'attente' && (
        <div className="animation-attente">
          <h1 className="titre-xl">{etat.detail.fiche.titre_fr}</h1>
          <p className="animation-consigne">Les élèves ouvrent l’activité sur leur tablette et attendent ici.</p>
          <p className="animation-grand-nombre">{nbConnectes}<span> élève{nbConnectes > 1 ? 's' : ''} dans la salle</span></p>
          <ul className="animation-noms">
            {etat.participants.map((p) => <li key={p.eleve.id}>{p.eleve.prenom} {p.eleve.nom.charAt(0)}.</li>)}
          </ul>
          {!atelierEnCours && <p className="encart encart-alerte">L’atelier n’est pas démarré : démarrez-le depuis la page du groupe.</p>}
          {s.statut !== 'ouverte' && <p className="encart encart-alerte">L’activité est fermée : ouvrez-la depuis la page du groupe pour que les élèves puissent entrer.</p>}
          <button type="button" className="bouton bouton-principal bouton-geant" disabled={!atelierEnCours || s.statut !== 'ouverte'} onClick={() => agir('suivante')}>
            Lancer la première question
          </button>
          <p className="aide">{etat.questions.length} questions. Les élèves qui arrivent en retard peuvent rejoindre à tout moment.</p>
        </div>
      )}

      {/* ---------- Question en cours ---------- */}
      {q && s.etape === 'question' && s.question_lancee_le && (
        <div className="animation-question">
          <ChronoPartage
            lanceeLe={s.question_lancee_le}
            decalage={etat.decalage_ms}
            duree={q.duree_secondes}
            libelle={(n) => `${n} s`}
            // fin du chrono : révélation automatique, après la petite marge accordée aux élèves
            onFin={() => setTimeout(() => void agir('reveler'), DELAI_GRACE_MS)}
          />
          <p className="question-numero">Question {etat.index + 1} sur {etat.questions.length}</p>
          <h1 className="animation-enonce">{q.enonce_fr}</h1>
          {q.image && <img className="animation-image" src={q.image} alt="" />}
          <ChoixProjetes etat={etat} revele={false} />
          <div className="animation-pied">
            <p className="animation-grand-nombre animation-reponses">{etat.reponsesQuestion.length}<span>/{nbConnectes} réponses</span></p>
            <button type="button" className="bouton" onClick={() => agir('reveler')}>Révéler la réponse maintenant</button>
          </div>
        </div>
      )}

      {/* ---------- Révélation ---------- */}
      {q && s.etape === 'revelation' && (
        <div className="animation-question">
          <p className="question-numero">Question {etat.index + 1} sur {etat.questions.length}</p>
          <h1 className="animation-enonce">{q.enonce_fr}</h1>
          <ChoixProjetes etat={etat} revele />
          {q.type === 'qro_ia' && <p className="aide">{etat.reponsesQuestion.length} réponses écrites : elles seront corrigées par l’IA à la fin.</p>}
          {estNotee(q.type) && q.type !== 'qro_ia' && (
            <p className="animation-bilan">
              {etat.reponsesQuestion.filter((r) => (r.score_final ?? 0) >= q.points).length} élève(s) sur {nbConnectes} ont trouvé la bonne réponse.
            </p>
          )}
          <div className="animation-pied">
            <button type="button" className="bouton" onClick={() => agir('classement')}>Afficher le classement</button>
            {boutonSuite}
          </div>
        </div>
      )}

      {/* ---------- Classement intermédiaire ---------- */}
      {s.etape === 'classement' && (
        <div className="animation-classement">
          <p className="question-numero">Après la question {etat.index + 1} sur {etat.questions.length}</p>
          <h1 className="titre-xl">Classement</h1>
          <Classement top={top} />
          <div className="animation-pied">{boutonSuite}</div>
        </div>
      )}

      {/* ---------- Fin ---------- */}
      {s.etape === 'terminee' && (
        <div className="animation-classement">
          <h1 className="titre-xl">Classement final</h1>
          {top.length >= 1 && (
            <div className="podium" aria-label="Podium">
              {[1, 0, 2].map((i) => top[i] && (
                <div key={top[i].eleve_id} className={`podium-marche podium-marche-${i + 1}`}>
                  <span className="podium-nom">{top[i].nom_affiche}</span>
                  <span className="podium-score">{nombre(top[i].score)} pts</span>
                  <span className="podium-socle">{i + 1}</span>
                </div>
              ))}
            </div>
          )}
          <Classement top={top} />
          <div className="animation-pied">
            <Link className="bouton" to={`/formateur/session/${sessionId}`}>Voir les résultats détaillés</Link>
            <Link className="bouton bouton-principal" to={`/formateur/groupe/${etat.detail.groupe.id}`}>Retour au groupe</Link>
          </div>
        </div>
      )}
    </section>
  )
}

/** Choix affichés en grand, une couleur et une forme par lettre (lisibles aussi par les élèves daltoniens). */
function ChoixProjetes({ etat, revele }: { etat: EtatPilote; revele: boolean }) {
  const q = etat.questions[etat.index]
  if (q.type !== 'qcm_unique' && q.type !== 'qcm_multiple') return null
  const total = etat.reponsesQuestion.length || 1
  return (
    <ol className="choix-projetes">
      {q.choix.map((c, i) => {
        const nb = etat.reponsesQuestion.filter((r) => r.choix_coches.includes(c.id)).length
        return (
          <li key={c.id} className={`choix-projete forme-${i % 4}${revele ? (c.est_correct ? ' choix-projete-bon' : ' choix-projete-faux') : ''}`}>
            <span className="choix-projete-forme" aria-hidden="true" />
            <span className="choix-projete-texte">{c.texte_fr}</span>
            {c.image && <img src={c.image} alt="" className="choix-projete-image" />}
            {revele && (
              <span className="choix-projete-compte">
                <span className="choix-projete-barre" style={{ width: `${(nb / total) * 100}%` }} />
                <span>{nb}</span>
              </span>
            )}
            {revele && c.est_correct && <span className="sr-only">bonne réponse</span>}
          </li>
        )
      })}
    </ol>
  )
}

function Classement({ top }: { top: LigneClassement[] }) {
  if (top.length === 0) return <p className="vide">Personne n’a encore de points.</p>
  return (
    <ol className="classement-liste projection-liste">
      {top.map((l) => (
        <li key={l.eleve_id} className={`classement-ligne${l.rang <= 3 ? ` podium-${l.rang}` : ''}`}>
          <span className="classement-rang">{l.rang}</span>
          <span className="classement-nom">{l.nom_affiche}</span>
          <span className="classement-score">{nombre(l.score)} pts</span>
          <span className="classement-temps">{Math.round(l.temps_total_ms / 1000)} s</span>
        </li>
      ))}
    </ol>
  )
}
