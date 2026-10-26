import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { staff } from '../data'
import { ErreurDroits, type FicheEditable, type QuestionEditable, type ResumeFiche } from '../data/staffRepository'
import { estAdmin, peutModifierFiche, peutValider } from '../lib/droits'
import { nouvelId } from '../lib/ids'
import { ILLUSTRATIONS, preparerImage } from '../lib/images'
import { estNotee } from '../lib/scoring'
import { verifierFiche, type Probleme } from '../lib/validationFiche'
import type { Choix, Competence, Technologie, TypeFiche, TypeQuestion } from '../types'
import { useStaff } from './contexteStaff'
import { libelleType, libelleValidation } from './libelles'

const libelleTypeQuestion: Record<TypeQuestion, string> = {
  qcm_unique: 'QCM, une seule réponse',
  qcm_multiple: 'QCM, plusieurs réponses',
  qro_ia: 'Réponse écrite corrigée par l’IA',
  qro_qualitative: 'Réponse écrite libre (non notée)',
  echelle: 'Échelle d’avis (non notée)',
}

const nouveauChoix = (questionId: string, ordre: number): Choix => ({
  id: nouvelId(), question_id: questionId, texte_fr: '', texte_en: '', est_correct: false, ordre,
})

const nouvelleQuestion = (typeFiche: TypeFiche): QuestionEditable => {
  const id = nouvelId()
  const type: TypeQuestion = typeFiche === 'satisfaction' ? 'echelle' : 'qcm_unique'
  return {
    id, type, enonce_fr: '', enonce_en: '', duree_secondes: 30, points: estNotee(type) ? 1 : 0, mode_bareme: 'tout_ou_rien',
    choix: estNotee(type) ? [nouveauChoix(id, 0), nouveauChoix(id, 1), nouveauChoix(id, 2)] : [],
  }
}

const nouvelleFiche = (): FicheEditable => ({
  fiche: {
    id: nouvelId(), titre_fr: '', titre_en: '', type: 'pretest', mode_correction: 'ia_definitive',
    visibilite: 'privee', statut_validation: 'brouillon', auteur_id: '', version: 1,
  },
  questions: [],
})

export function EditeurFiche() {
  const { ficheId } = useParams()
  const { moi } = useStaff()
  const naviguer = useNavigate()
  const [f, setF] = useState<FicheEditable>()
  const [existe, setExiste] = useState(false)
  const [utilisee, setUtilisee] = useState(false)
  const [technos, setTechnos] = useState<Technologie[]>([])
  const [competences, setCompetences] = useState<Competence[]>([])
  const [banque, setBanque] = useState<ResumeFiche[]>([])
  const [jumelle, setJumelle] = useState<FicheEditable>()
  const [problemes, setProblemes] = useState<Probleme[]>([])
  const [message, setMessage] = useState<{ type: 'ok' | 'erreur'; texte: string }>()
  const [modifie, setModifie] = useState(false)
  const [refus, setRefus] = useState('')

  useEffect(() => {
    if (!moi) return
    staff.technologies().then(setTechnos)
    staff.competences().then(setCompetences)
    staff.fichesVisibles(moi).then((b) => {
      setBanque(b)
      setUtilisee(!!b.find((x) => x.fiche.id === ficheId)?.nb_sessions)
    })
    if (ficheId) staff.chargerFiche(ficheId).then((x) => { setF(x); setExiste(true) })
    else setF(nouvelleFiche())
  }, [ficheId, moi])

  useEffect(() => {
    if (f?.fiche.fiche_jumelle_id) staff.chargerFiche(f.fiche.fiche_jumelle_id).then(setJumelle)
    else setJumelle(undefined)
  }, [f?.fiche.fiche_jumelle_id])

  // Prévenir avant de quitter une fiche modifiée et non enregistrée
  useEffect(() => {
    if (!modifie) return
    const avant = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', avant)
    return () => window.removeEventListener('beforeunload', avant)
  }, [modifie])

  const lectureSeule = useMemo(() => !!(f && moi && existe && !peutModifierFiche(f.fiche, moi)), [f, moi, existe])
  const pretests = banque.filter((b) => b.fiche.type === 'pretest' && b.fiche.id !== f?.fiche.id
    && (!f?.fiche.technologie_id || b.fiche.technologie_id === f.fiche.technologie_id))

  if (!moi || !f) return <p className="aide">Chargement…</p>

  const majFiche = (patch: Partial<FicheEditable['fiche']>) => { setF({ ...f, fiche: { ...f.fiche, ...patch } }); setModifie(true) }
  const majQuestion = (i: number, q: QuestionEditable) => {
    setF({ ...f, questions: f.questions.map((x, j) => (j === i ? q : x)) })
    setModifie(true)
  }
  const deplacer = (i: number, sens: -1 | 1) => {
    const qs = [...f.questions]
    const j = i + sens
    if (j < 0 || j >= qs.length) return
    ;[qs[i], qs[j]] = [qs[j], qs[i]]
    setF({ ...f, questions: qs }); setModifie(true)
  }
  const supprimer = (i: number) => { setF({ ...f, questions: f.questions.filter((_, j) => j !== i) }); setModifie(true) }
  const dupliquer = (i: number) => {
    const q = f.questions[i]
    const id = nouvelId()
    const copie = { ...q, id, choix: q.choix.map((c) => ({ ...c, id: nouvelId(), question_id: id })) }
    const qs = [...f.questions]; qs.splice(i + 1, 0, copie)
    setF({ ...f, questions: qs }); setModifie(true)
  }

  async function enregistrer(): Promise<boolean> {
    if (!f || !moi) return false
    const p = verifierFiche(f)
    setProblemes(p)
    if (p.length) { setMessage({ type: 'erreur', texte: `${p.length} point${p.length > 1 ? 's' : ''} à corriger avant d’enregistrer.` }); return false }
    try {
      const id = await staff.enregistrerFiche(f, moi)
      setModifie(false); setExiste(true)
      setMessage({ type: 'ok', texte: 'Fiche enregistrée.' })
      if (!ficheId) naviguer(`/formateur/fiches/${id}`, { replace: true })
      setF(await staff.chargerFiche(id))
      return true
    } catch (e) {
      setMessage({ type: 'erreur', texte: e instanceof ErreurDroits ? e.message : 'L’enregistrement a échoué. Réessayez.' })
      return false
    }
  }

  async function soumettre() {
    if (!f || !moi) return
    const p = verifierFiche(f, true)
    setProblemes(p)
    if (p.length) { setMessage({ type: 'erreur', texte: 'Corrigez ces points avant de soumettre la fiche.' }); return }
    if (modifie && !(await enregistrer())) return
    try {
      await staff.soumettreFiche(f.fiche.id, moi)
      setF(await staff.chargerFiche(f.fiche.id))
      setMessage({ type: 'ok', texte: 'Fiche soumise. Un admin va la relire.' })
    } catch (e) {
      setMessage({ type: 'erreur', texte: e instanceof ErreurDroits ? e.message : 'La soumission a échoué.' })
    }
  }

  async function decider(valider: boolean) {
    if (!f || !moi) return
    try {
      if (valider) await staff.validerFiche(f.fiche.id, moi)
      else await staff.refuserFiche(f.fiche.id, refus, moi)
      setF(await staff.chargerFiche(f.fiche.id))
      setMessage({ type: 'ok', texte: valider ? 'Fiche validée : elle est maintenant officielle.' : 'Fiche renvoyée à son auteur avec votre remarque.' })
      setRefus('')
    } catch (e) {
      setMessage({ type: 'erreur', texte: e instanceof ErreurDroits ? e.message : 'L’action a échoué.' })
    }
  }

  const statut = f.fiche.statut_validation
  const totalPoints = f.questions.filter((q) => estNotee(q.type)).reduce((s, q) => s + (Number(q.points) || 0), 0)
  const dureeTotale = f.questions.reduce((s, q) => s + (Number(q.duree_secondes) || 0), 0)
  const problemesFiche = problemes.filter((p) => p.question === undefined)

  return (
    <section className="editeur">
      <Link to="/formateur/fiches" className="lien">‹ Banque de fiches</Link>

      <div className="titre-avec-action">
        <h1 className="titre-l">{existe ? (f.fiche.titre_fr || 'Fiche sans titre') : 'Nouvelle fiche'}</h1>
        {existe && <span className={`etat-fiche etat-fiche-${statut}`}>{libelleValidation[statut]}</span>}
      </div>

      {statut === 'refusee' && f.fiche.commentaire_validation && (
        <div className="encart encart-alerte">
          <strong>Remarque de l’admin :</strong> {f.fiche.commentaire_validation}
          <p className="aide">Corrigez la fiche, enregistrez-la, puis soumettez-la à nouveau.</p>
        </div>
      )}
      {lectureSeule && (
        <div className="encart">
          {statut === 'validee'
            ? 'Cette fiche est officielle : elle ne se modifie plus. Dupliquez-la pour en faire une variante.'
            : 'Vous pouvez consulter cette fiche mais pas la modifier. Dupliquez-la pour l’adapter.'}
          <button type="button" className="bouton" onClick={async () => naviguer(`/formateur/fiches/${await staff.dupliquerFiche(f.fiche.id, moi)}`)}>
            Dupliquer la fiche
          </button>
        </div>
      )}
      {utilisee && !lectureSeule && (
        <p className="encart">Cette fiche est programmée dans un groupe. Si des élèves l’ont déjà passée, il faudra la dupliquer pour la modifier.</p>
      )}

      {/* Décision de l'admin */}
      {statut === 'soumise' && peutValider(moi) && (
        <div className="encart encart-decision">
          <p><strong>Fiche soumise à validation.</strong> Relisez les questions ci-dessous, puis décidez.</p>
          <div className="decision">
            <button type="button" className="bouton bouton-principal" onClick={() => decider(true)}>Valider et rendre officielle</button>
            <div className="decision-refus">
              <label htmlFor="motif-refus">Ou renvoyer à l’auteur avec une remarque</label>
              <textarea id="motif-refus" className="champ-texte" rows={2} value={refus} onChange={(e) => setRefus(e.target.value)} placeholder="Ce qu’il faut corriger…" />
              <button type="button" className="bouton" disabled={!refus.trim()} onClick={() => decider(false)}>Renvoyer pour correction</button>
            </div>
          </div>
        </div>
      )}

      {message && <p className={message.type === 'ok' ? 'message-ok' : 'erreur'} role={message.type === 'ok' ? 'status' : 'alert'}>{message.texte}</p>}
      {problemesFiche.map((p) => <p key={p.message} className="erreur">{p.message}</p>)}

      <fieldset className="editeur-champs" disabled={lectureSeule}>
        <div className="grille-champs">
          <label className="champ-groupe">
            <span>Titre (français)</span>
            <input className="champ" value={f.fiche.titre_fr} onChange={(e) => majFiche({ titre_fr: e.target.value })} placeholder="Prétest — Mon premier robot" />
          </label>
          <label className="champ-groupe">
            <span>Titre (anglais, facultatif)</span>
            <input className="champ" value={f.fiche.titre_en ?? ''} onChange={(e) => majFiche({ titre_en: e.target.value })} placeholder="Pre-test — My first robot" />
          </label>
          <label className="champ-groupe">
            <span>Type de fiche</span>
            <select className="champ" value={f.fiche.type} onChange={(e) => majFiche({ type: e.target.value as TypeFiche, fiche_jumelle_id: undefined })}>
              {(Object.keys(libelleType) as TypeFiche[]).map((t) => <option key={t} value={t}>{libelleType[t]}</option>)}
            </select>
          </label>
          <label className="champ-groupe">
            <span>Technologie</span>
            <select className="champ" value={f.fiche.technologie_id ?? ''} onChange={(e) => majFiche({ technologie_id: e.target.value || undefined })}>
              <option value="">Toutes (fiche générale)</option>
              {technos.map((t) => <option key={t.id} value={t.id}>{t.nom_fr}</option>)}
            </select>
          </label>
          {f.fiche.type === 'posttest' && (
            <label className="champ-groupe champ-large">
              <span>Prétest comparé</span>
              <select className="champ" value={f.fiche.fiche_jumelle_id ?? ''} onChange={(e) => majFiche({ fiche_jumelle_id: e.target.value || undefined })}>
                <option value="">Choisir le prétest…</option>
                {pretests.map((p) => <option key={p.fiche.id} value={p.fiche.id}>{p.fiche.titre_fr}</option>)}
              </select>
              <small className="aide">Reformulez les questions du prétest (même compétence, autres mots) pour éviter que les élèves récitent.</small>
            </label>
          )}
          {f.questions.some((q) => q.type === 'qro_ia') && (
            <label className="champ-groupe champ-large">
              <span>Correction des réponses écrites</span>
              <select className="champ" value={f.fiche.mode_correction} onChange={(e) => majFiche({ mode_correction: e.target.value as FicheEditable['fiche']['mode_correction'] })}>
                <option value="ia_definitive">La note de l’IA est définitive</option>
                <option value="ia_puis_formateur">L’IA propose, le formateur valide</option>
              </select>
            </label>
          )}
          {(f.fiche.auteur_id === moi.id || !existe) && statut !== 'validee' && (
            <label className="interrupteur champ-large">
              <input type="checkbox" checked={f.fiche.visibilite === 'partagee'} onChange={(e) => majFiche({ visibilite: e.target.checked ? 'partagee' : 'privee' })} />
              Partager ce brouillon avec les autres formateurs (lecture et duplication)
            </label>
          )}
        </div>

        <div className="resume-fiche">
          <span>{f.questions.length} question{f.questions.length > 1 ? 's' : ''}</span>
          {f.fiche.type !== 'satisfaction' && <span>{totalPoints.toLocaleString('fr-FR')} points</span>}
          <span>environ {Math.ceil(dureeTotale / 60)} min</span>
        </div>

        <ol className="questions-editeur">
          {f.questions.map((q, i) => (
            <CarteQuestion
              key={q.id}
              q={q}
              index={i}
              total={f.questions.length}
              typeFiche={f.fiche.type}
              technologieId={f.fiche.technologie_id}
              competences={competences}
              onNouvelleCompetence={(c) => setCompetences([...competences, c])}
              jumelle={jumelle}
              problemes={problemes.filter((p) => p.question === i).map((p) => p.message)}
              lectureSeule={lectureSeule}
              onChange={(nq) => majQuestion(i, nq)}
              onMonter={() => deplacer(i, -1)}
              onDescendre={() => deplacer(i, 1)}
              onDupliquer={() => dupliquer(i)}
              onSupprimer={() => supprimer(i)}
            />
          ))}
        </ol>

        {!lectureSeule && (
          <button type="button" className="bouton bouton-ajout" onClick={() => { setF({ ...f, questions: [...f.questions, nouvelleQuestion(f.fiche.type)] }); setModifie(true) }}>
            + Ajouter une question
          </button>
        )}
      </fieldset>

      {!lectureSeule && (
        <div className="barre-actions">
          <span className="aide">{modifie ? 'Modifications non enregistrées' : existe ? 'Tout est enregistré' : ''}</span>
          <div className="barre-actions-boutons">
            {existe && f.fiche.auteur_id === moi.id && statut !== 'validee' && !utilisee && (
              <button type="button" className="lien lien-danger" onClick={async () => {
                try { await staff.supprimerFiche(f.fiche.id, moi); naviguer('/formateur/fiches') } catch (e) {
                  setMessage({ type: 'erreur', texte: e instanceof ErreurDroits ? e.message : 'Suppression impossible.' })
                }
              }}>Supprimer la fiche</button>
            )}
            <button type="button" className="bouton" onClick={enregistrer}>Enregistrer</button>
            {(statut === 'brouillon' || statut === 'refusee') && !estAdmin(moi) && (
              <button type="button" className="bouton bouton-principal" onClick={soumettre}>Soumettre à validation</button>
            )}
            {estAdmin(moi) && (statut === 'brouillon' || statut === 'refusee') && existe && !modifie && (
              <button type="button" className="bouton bouton-principal" onClick={() => decider(true)}>Valider et rendre officielle</button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

// ----------------------------------------------------------------------------------- Question

interface PropsCarte {
  q: QuestionEditable
  index: number
  total: number
  typeFiche: TypeFiche
  technologieId?: string
  competences: Competence[]
  onNouvelleCompetence: (c: Competence) => void
  jumelle?: FicheEditable
  problemes: string[]
  lectureSeule: boolean
  onChange: (q: QuestionEditable) => void
  onMonter: () => void
  onDescendre: () => void
  onDupliquer: () => void
  onSupprimer: () => void
}

function CarteQuestion(p: PropsCarte) {
  const { q, index, onChange } = p
  const maj = (patch: Partial<QuestionEditable>) => onChange({ ...q, ...patch })
  const estQcm = q.type === 'qcm_unique' || q.type === 'qcm_multiple'
  const idBase = `q${index}`

  const changerType = (type: TypeQuestion) => {
    const qcm = type === 'qcm_unique' || type === 'qcm_multiple'
    let choix = q.choix
    if (qcm && choix.length === 0) choix = [nouveauChoix(q.id, 0), nouveauChoix(q.id, 1), nouveauChoix(q.id, 2)]
    if (!qcm) choix = []
    // une seule bonne réponse : on garde la première cochée
    if (type === 'qcm_unique') {
      const premiere = choix.findIndex((c) => c.est_correct)
      choix = choix.map((c, i) => ({ ...c, est_correct: i === premiere }))
    }
    maj({ type, choix, points: estNotee(type) ? (q.points || 1) : 0 })
  }

  const competencesFiltrees = p.competences.filter((c) => !p.technologieId || c.technologie_id === p.technologieId)

  return (
    <li className={`carte-question${p.problemes.length ? ' carte-question-erreur' : ''}`}>
      <div className="carte-question-entete">
        <span className="carte-question-numero">Question {index + 1}</span>
        {!p.lectureSeule && (
          <div className="carte-question-outils">
            <button type="button" className="outil" onClick={p.onMonter} disabled={index === 0} aria-label={`Monter la question ${index + 1}`}>↑</button>
            <button type="button" className="outil" onClick={p.onDescendre} disabled={index === p.total - 1} aria-label={`Descendre la question ${index + 1}`}>↓</button>
            <button type="button" className="lien" onClick={p.onDupliquer}>Dupliquer</button>
            <button type="button" className="lien lien-danger" onClick={p.onSupprimer}>Supprimer</button>
          </div>
        )}
      </div>

      {p.problemes.length > 0 && <ul className="problemes">{p.problemes.map((m) => <li key={m}>{m}</li>)}</ul>}

      <div className="grille-champs">
        <label className="champ-groupe champ-large">
          <span>Type de question</span>
          <select className="champ" value={q.type} onChange={(e) => changerType(e.target.value as TypeQuestion)}>
            {(Object.keys(libelleTypeQuestion) as TypeQuestion[])
              .filter((t) => p.typeFiche !== 'satisfaction' || !estNotee(t))
              .map((t) => <option key={t} value={t}>{libelleTypeQuestion[t]}</option>)}
          </select>
        </label>
        <label className="champ-groupe">
          <span>Énoncé (français)</span>
          <textarea className="champ-texte" rows={2} value={q.enonce_fr} onChange={(e) => maj({ enonce_fr: e.target.value })} />
        </label>
        <label className="champ-groupe">
          <span>Énoncé (anglais)</span>
          <textarea className="champ-texte" rows={2} value={q.enonce_en ?? ''} onChange={(e) => maj({ enonce_en: e.target.value })} />
        </label>
      </div>

      <ChoixImage
        id={`${idBase}-image`}
        libelle="Image de la question"
        valeur={q.image}
        lectureSeule={p.lectureSeule}
        onChange={(image) => maj({ image })}
      />

      <div className="grille-champs grille-champs-4">
        <label className="champ-groupe">
          <span>Temps (secondes)</span>
          <input className="champ" type="number" min={5} max={600} step={5} value={q.duree_secondes} onChange={(e) => maj({ duree_secondes: Number(e.target.value) })} />
        </label>
        {estNotee(q.type) && (
          <label className="champ-groupe">
            <span>Points</span>
            <input className="champ" type="number" min={0.5} step={0.5} value={q.points} onChange={(e) => maj({ points: Number(e.target.value) })} />
          </label>
        )}
        {q.type === 'qcm_multiple' && (
          <label className="champ-groupe">
            <span>Barème</span>
            <select className="champ" value={q.mode_bareme} onChange={(e) => maj({ mode_bareme: e.target.value as QuestionEditable['mode_bareme'] })}>
              <option value="proportionnel">Proportionnel aux bonnes cases</option>
              <option value="tout_ou_rien">Tout ou rien</option>
            </select>
          </label>
        )}
        {estNotee(q.type) && (
          <SelectCompetence
            id={`${idBase}-competence`}
            valeur={q.competence_id}
            competences={competencesFiltrees}
            technologieId={p.technologieId}
            lectureSeule={p.lectureSeule}
            onChange={(competence_id) => maj({ competence_id })}
            onNouvelle={p.onNouvelleCompetence}
          />
        )}
      </div>

      {p.jumelle && estNotee(q.type) && (
        <label className="champ-groupe">
          <span>Question correspondante du prétest</span>
          <select className="champ" value={q.question_jumelle_id ?? ''} onChange={(e) => {
            const jum = p.jumelle?.questions.find((x) => x.id === e.target.value)
            maj({ question_jumelle_id: e.target.value || undefined, competence_id: q.competence_id ?? jum?.competence_id })
          }}>
            <option value="">Aucune</option>
            {p.jumelle.questions.filter((x) => estNotee(x.type)).map((x, i) => <option key={x.id} value={x.id}>{i + 1}. {x.enonce_fr}</option>)}
          </select>
        </label>
      )}

      {estQcm && (
        <div className="choix-editeur">
          <p className="choix-editeur-titre">Réponses proposées <span className="aide">(cochez {q.type === 'qcm_unique' ? 'la bonne réponse' : 'toutes les bonnes réponses'})</span></p>
          <ol className="choix-liste">
            {q.choix.map((c, i) => (
              <li key={c.id} className={`choix-ligne${c.est_correct ? ' choix-ligne-bonne' : ''}`}>
                <label className="choix-correct">
                  <input
                    type={q.type === 'qcm_unique' ? 'radio' : 'checkbox'}
                    name={`${idBase}-correct`}
                    checked={c.est_correct}
                    onChange={(e) => maj({
                      choix: q.choix.map((x, j) => q.type === 'qcm_unique'
                        ? { ...x, est_correct: j === i }
                        : j === i ? { ...x, est_correct: e.target.checked } : x),
                    })}
                    aria-label={`Réponse ${String.fromCharCode(65 + i)} correcte`}
                  />
                  <span aria-hidden="true">{String.fromCharCode(65 + i)}</span>
                </label>
                <input className="champ" value={c.texte_fr} placeholder="Réponse (français)" aria-label={`Réponse ${String.fromCharCode(65 + i)} en français`}
                  onChange={(e) => maj({ choix: q.choix.map((x, j) => (j === i ? { ...x, texte_fr: e.target.value } : x)) })} />
                <input className="champ" value={c.texte_en ?? ''} placeholder="Réponse (anglais)" aria-label={`Réponse ${String.fromCharCode(65 + i)} en anglais`}
                  onChange={(e) => maj({ choix: q.choix.map((x, j) => (j === i ? { ...x, texte_en: e.target.value } : x)) })} />
                <ChoixImage
                  id={`${idBase}-choix-${i}`}
                  libelle={`Image de la réponse ${String.fromCharCode(65 + i)}`}
                  valeur={c.image}
                  compact
                  lectureSeule={p.lectureSeule}
                  onChange={(image) => maj({ choix: q.choix.map((x, j) => (j === i ? { ...x, image } : x)) })}
                />
                {!p.lectureSeule && q.choix.length > 2 && (
                  <button type="button" className="outil" aria-label={`Supprimer la réponse ${String.fromCharCode(65 + i)}`}
                    onClick={() => maj({ choix: q.choix.filter((_, j) => j !== i) })}>×</button>
                )}
              </li>
            ))}
          </ol>
          {!p.lectureSeule && q.choix.length < 6 && (
            <button type="button" className="lien" onClick={() => maj({ choix: [...q.choix, nouveauChoix(q.id, q.choix.length)] })}>+ Ajouter une réponse</button>
          )}
        </div>
      )}

      {q.type === 'qro_ia' && (
        <div className="grille-champs">
          <label className="champ-groupe">
            <span>Réponse attendue (français)</span>
            <textarea className="champ-texte" rows={2} value={q.reponse_attendue_fr ?? ''} onChange={(e) => maj({ reponse_attendue_fr: e.target.value })} />
          </label>
          <label className="champ-groupe">
            <span>Réponse attendue (anglais)</span>
            <textarea className="champ-texte" rows={2} value={q.reponse_attendue_en ?? ''} onChange={(e) => maj({ reponse_attendue_en: e.target.value })} />
          </label>
          <label className="champ-groupe champ-large">
            <span>Critères de correction pour l’IA</span>
            <textarea className="champ-texte" rows={2} value={q.criteres_correction ?? ''} onChange={(e) => maj({ criteres_correction: e.target.value })}
              placeholder="1 point si… ; 1 point si…" />
          </label>
        </div>
      )}
    </li>
  )
}

// ----------------------------------------------------------------------------------- Image

function ChoixImage({ id, libelle, valeur, onChange, compact, lectureSeule }: {
  id: string; libelle: string; valeur?: string; onChange: (v?: string) => void; compact?: boolean; lectureSeule: boolean
}) {
  const [galerie, setGalerie] = useState(false)
  const [erreur, setErreur] = useState<string>()
  const fichier = useRef<HTMLInputElement>(null)

  return (
    <div className={`choix-image${compact ? ' choix-image-compact' : ''}`}>
      {valeur ? (
        <div className="choix-image-apercu">
          <img src={valeur} alt={libelle} />
          {!lectureSeule && <button type="button" className="lien lien-danger" onClick={() => onChange(undefined)}>Retirer</button>}
        </div>
      ) : !lectureSeule && (
        <div className="choix-image-boutons">
          <button type="button" className="lien" onClick={() => fichier.current?.click()}>{compact ? 'Image' : 'Ajouter une image ou une photo'}</button>
          <button type="button" className="lien" onClick={() => setGalerie(!galerie)} aria-expanded={galerie}>{compact ? 'Galerie' : 'Choisir une illustration'}</button>
        </div>
      )}
      <input
        ref={fichier}
        id={id}
        type="file"
        accept="image/*"
        capture={compact ? undefined : 'environment'}
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setErreur(undefined)
          try { onChange(await preparerImage(f)) } catch (err) { setErreur(err instanceof Error ? err.message : 'Image non ajoutée.') }
        }}
      />
      {erreur && <p className="erreur">{erreur}</p>}
      {galerie && !valeur && (
        <div className="galerie" role="listbox" aria-label="Illustrations">
          {ILLUSTRATIONS.map((src) => (
            <button key={src} type="button" role="option" aria-selected={false} className="galerie-item" onClick={() => { onChange(src); setGalerie(false) }}>
              <img src={src} alt={src.replace('demo/', '').replace('.svg', '')} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------------- Compétence

function SelectCompetence({ id, valeur, competences, technologieId, lectureSeule, onChange, onNouvelle }: {
  id: string; valeur?: string; competences: Competence[]; technologieId?: string; lectureSeule: boolean
  onChange: (v?: string) => void; onNouvelle: (c: Competence) => void
}) {
  const [ajout, setAjout] = useState(false)
  const [libelle, setLibelle] = useState('')

  if (ajout) {
    return (
      <div className="champ-groupe">
        <label htmlFor={id}>Nouvelle compétence</label>
        <div className="programmer-ligne">
          <input id={id} className="champ" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Reconnaître un capteur" />
          <button type="button" className="bouton" disabled={!libelle.trim() || !technologieId} onClick={async () => {
            if (!technologieId) return
            const c = await staff.ajouterCompetence(technologieId, libelle)
            onNouvelle(c); onChange(c.id); setAjout(false); setLibelle('')
          }}>Ajouter</button>
        </div>
        {!technologieId && <small className="aide">Choisissez d’abord la technologie de la fiche.</small>}
        <button type="button" className="lien" onClick={() => setAjout(false)}>Annuler</button>
      </div>
    )
  }
  return (
    <label className="champ-groupe">
      <span>Compétence évaluée</span>
      <select id={id} className="champ" value={valeur ?? ''} onChange={(e) => {
        if (e.target.value === '__nouvelle') setAjout(true)
        else onChange(e.target.value || undefined)
      }}>
        <option value="">Aucune</option>
        {competences.map((c) => <option key={c.id} value={c.id}>{c.libelle_fr}</option>)}
        {!lectureSeule && <option value="__nouvelle">+ Nouvelle compétence…</option>}
      </select>
    </label>
  )
}
