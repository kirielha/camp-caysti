import { classer } from '../lib/ranking'
import { noterReponse, totaliser } from '../lib/scoring'
import { nouvelId } from '../lib/ids'
import type { AtelierPourEleve, Eleve, Langue, Progression, QuestionAvecChoix, Reponse, SessionPourEleve, Tentative, TypeFiche } from '../types'
import type { BaseCamp } from './db'
import { ErreurMetier, type Repository } from './repository'

const maintenant = () => new Date().toISOString()
/** Ordre des activités dans un atelier : prétest, quiz, post-test, avis. */
const ORDRE_DEROULE: Record<TypeFiche, number> = { pretest: 0, quiz: 1, posttest: 2, satisfaction: 3 }

export const normaliserCode = (code: string) => code.replace(/\s+/g, '').toUpperCase()

export function creerRepositoryLocal(db: BaseCamp): Repository {
  async function detailSession(sessionId: string): Promise<SessionPourEleve> {
    const session = await db.session_evaluation.get(sessionId)
    if (!session) throw new Error(`Session introuvable : ${sessionId}`)
    const [fiche, groupe] = await Promise.all([db.fiche.get(session.fiche_id), db.groupe.get(session.groupe_id)])
    const atelier = groupe && (await db.atelier.get(groupe.atelier_id))
    const technologie = atelier && (await db.technologie.get(atelier.technologie_id))
    if (!fiche || !groupe || !atelier || !technologie) throw new Error(`Session incomplète : ${sessionId}`)
    return { session, fiche, groupe, atelier, technologie }
  }

  async function questionsDeFiche(ficheId: string): Promise<QuestionAvecChoix[]> {
    const liens = (await db.fiche_question.where('fiche_id').equals(ficheId).toArray()).sort((a, b) => a.ordre - b.ordre)
    return Promise.all(
      liens.map(async (l) => {
        const q = await db.question.get(l.question_id)
        if (!q) throw new Error(`Question introuvable : ${l.question_id}`)
        const choix = (await db.choix.where('question_id').equals(q.id).toArray()).sort((a, b) => a.ordre - b.ordre)
        return { ...q, choix, ordre: l.ordre }
      }),
    )
  }

  const repo: Repository = {
    async trouverEleveParCode(code) {
      return db.eleve.where('code_acces').equals(normaliserCode(code)).first()
    },

    async changerLangueEleve(eleveId, langue: Langue) {
      await db.eleve.update(eleveId, { langue_interface: langue })
    },

    async ateliersPourEleve(eleveId) {
      const inscriptions = await db.inscription.where('eleve_id').equals(eleveId).toArray()
      const resultats = await Promise.all(
        inscriptions.map(async (insc) => {
          const groupe = await db.groupe.get(insc.groupe_id)
          const atelier = groupe && (await db.atelier.get(groupe.atelier_id))
          const technologie = atelier && (await db.technologie.get(atelier.technologie_id))
          if (!groupe || !atelier || !technologie) return undefined
          const sessions = (await db.session_evaluation.where('groupe_id').equals(groupe.id).toArray())
            .filter((s) => s.statut === 'ouverte')
          const activites = await Promise.all(
            sessions.map(async (s) => {
              const d = await detailSession(s.id)
              d.tentative = await db.tentative.where('[session_id+eleve_id]').equals([s.id, eleveId]).first()
              return d
            }),
          )
          activites.sort((a, b) => ORDRE_DEROULE[a.fiche.type] - ORDRE_DEROULE[b.fiche.type])
          return { atelier, groupe, technologie, activites }
        }),
      )
      return resultats
        .filter((r): r is AtelierPourEleve => !!r)
        .sort((a, b) => `${a.groupe.date} ${a.groupe.heure_debut}`.localeCompare(`${b.groupe.date} ${b.groupe.heure_debut}`))
    },

    async sessionsPourEleve(eleveId) {
      return (await repo.ateliersPourEleve(eleveId)).flatMap((a) => a.activites)
    },

    async progression(sessionId, eleveId) {
      const session = await db.session_evaluation.get(sessionId)
      if (!session) return {}
      // pré et post-tests du même groupe (donc du même atelier)
      const duGroupe = await db.session_evaluation.where('groupe_id').equals(session.groupe_id).toArray()
      const resultat: Progression = {}
      for (const s of duGroupe) {
        const fiche = await db.fiche.get(s.fiche_id)
        if (fiche?.type !== 'pretest' && fiche?.type !== 'posttest') continue
        const t = await db.tentative.where('[session_id+eleve_id]').equals([s.id, eleveId]).first()
        if (t && t.statut !== 'en_cours') resultat[fiche.type] = { score: t.score ?? 0, score_max: t.score_max ?? 0 }
      }
      return resultat
    },

    async chargerSession(sessionId) {
      const detail = await detailSession(sessionId)
      return { detail, questions: await questionsDeFiche(detail.fiche.id) }
    },

    async demarrerTentative(sessionId, eleveId, langue) {
      const session = await db.session_evaluation.get(sessionId)
      if (!session || session.statut !== 'ouverte') throw new ErreurMetier('session_fermee')
      const groupeOk = await db.inscription.where('[eleve_id+groupe_id]').equals([eleveId, session.groupe_id]).count()
      if (!groupeOk) throw new ErreurMetier('non_inscrit')

      const existante = await db.tentative.where('[session_id+eleve_id]').equals([sessionId, eleveId]).first()
      if (existante && existante.statut !== 'en_cours') throw new ErreurMetier('deja_soumise')
      if (existante) {
        return { tentative: existante, reponses: await db.reponse.where('tentative_id').equals(existante.id).toArray() }
      }
      const tentative: Tentative = {
        id: nouvelId(), session_id: sessionId, eleve_id: eleveId, langue, debut: maintenant(), statut: 'en_cours',
      }
      await db.tentative.add(tentative)
      return { tentative, reponses: [] }
    },

    async enregistrerReponse(tentativeId, questionId, saisie) {
      const tentative = await db.tentative.get(tentativeId)
      if (!tentative) throw new Error('Tentative introuvable')
      if (tentative.statut !== 'en_cours') throw new ErreurMetier('deja_soumise')
      const question = await db.question.get(questionId)
      if (!question) throw new Error('Question introuvable')
      const choix = await db.choix.where('question_id').equals(questionId).toArray()

      const existante = await db.reponse.where('[tentative_id+question_id]').equals([tentativeId, questionId]).first()
      const reponse: Reponse = {
        id: existante?.id ?? nouvelId(),
        tentative_id: tentativeId,
        question_id: questionId,
        choix_coches: saisie.choix_coches,
        texte: saisie.texte?.trim() || undefined,
        temps_ms: Math.max(0, Math.round(saisie.temps_ms)),
        ...noterReponse(question, choix, saisie.choix_coches),
      }
      await db.reponse.put(reponse)
      return reponse
    },

    async soumettreTentative(tentativeId) {
      const tentative = await db.tentative.get(tentativeId)
      if (!tentative) throw new Error('Tentative introuvable')
      const session = await db.session_evaluation.get(tentative.session_id)
      const questions = session ? await questionsDeFiche(session.fiche_id) : []
      const reponses = await db.reponse.where('tentative_id').equals(tentativeId).toArray()
      const { score, score_max, temps_total_ms, en_attente } = totaliser(questions, reponses)
      const maj: Partial<Tentative> = { statut: 'soumise', fin: maintenant(), score, score_max, temps_total_ms }
      await db.tentative.update(tentativeId, maj)
      return { tentative: { ...tentative, ...maj }, en_attente }
    },

    async tentativeDe(sessionId, eleveId) {
      const tentative = await db.tentative.where('[session_id+eleve_id]').equals([sessionId, eleveId]).first()
      if (!tentative) return undefined
      const en_attente = await db.reponse
        .where('tentative_id').equals(tentative.id)
        .filter((r) => r.statut_correction === 'en_attente')
        .count()
      return { tentative, en_attente }
    },

    async classement(sessionId, limite = 10) {
      const tentatives = await db.tentative.where('session_id').equals(sessionId).toArray()
      const eleves = await db.eleve.bulkGet(tentatives.map((t) => t.eleve_id))
      const parId = new Map(eleves.filter((e): e is Eleve => !!e).map((e) => [e.id, e]))
      return classer(tentatives, parId, limite)
    },

    async fiche(ficheId) {
      return db.fiche.get(ficheId)
    },
  }
  return repo
}
