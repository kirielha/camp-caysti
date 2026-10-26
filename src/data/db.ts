// Base locale du navigateur (IndexedDB via Dexie).
// Elle sert à la fois de backend de développement (avant Supabase)
// et, plus tard, de cache hors ligne synchronisé avec Supabase.

import Dexie, { type Table } from 'dexie'
import type {
  Atelier, Camp, Choix, Competence, Eleve, Fiche, FicheQuestion, Groupe,
  Inscription, Question, Reponse, SessionEvaluation, Technologie, Tentative,
} from '../types'

export class BaseCamp extends Dexie {
  camp!: Table<Camp, string>
  technologie!: Table<Technologie, string>
  atelier!: Table<Atelier, string>
  groupe!: Table<Groupe, string>
  eleve!: Table<Eleve, string>
  inscription!: Table<Inscription, string>
  competence!: Table<Competence, string>
  fiche!: Table<Fiche, string>
  question!: Table<Question, string>
  choix!: Table<Choix, string>
  fiche_question!: Table<FicheQuestion, [string, string]>
  session_evaluation!: Table<SessionEvaluation, string>
  tentative!: Table<Tentative, string>
  reponse!: Table<Reponse, string>

  constructor(nom = 'camp-caysti') {
    super(nom)
    // Seuls les champs indexés sont listés ; les autres sont stockés tels quels.
    this.version(1).stores({
      camp: 'id, ville_id',
      technologie: 'id',
      atelier: 'id, camp_id, technologie_id',
      groupe: 'id, atelier_id',
      eleve: 'id, &code_acces',
      inscription: 'id, eleve_id, groupe_id, [eleve_id+groupe_id]',
      competence: 'id, technologie_id',
      fiche: 'id, type, technologie_id',
      question: 'id, competence_id',
      choix: 'id, question_id',
      fiche_question: '[fiche_id+question_id], fiche_id',
      session_evaluation: 'id, groupe_id, fiche_id, statut',
      tentative: 'id, session_id, eleve_id, [session_id+eleve_id]',
      reponse: 'id, tentative_id, [tentative_id+question_id]',
    })
  }
}
