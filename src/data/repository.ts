// Contrat d'accès aux données. L'interface ne dépend que de ce contrat :
// l'implémentation locale (localRepository) sera complétée par une
// implémentation Supabase sans toucher aux écrans.

import type {
  AtelierPourEleve, Eleve, Fiche, Langue, LigneClassement, Progression, QuestionAvecChoix, Reponse,
  SessionPourEleve, Tentative,
} from '../types'

export type CodeErreur = 'code_inconnu' | 'deja_soumise' | 'session_fermee' | 'non_inscrit'

export class ErreurMetier extends Error {
  code: CodeErreur
  constructor(code: CodeErreur, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

export interface Repository {
  /** Retrouve un élève à partir de son code personnel (insensible à la casse et aux espaces). */
  trouverEleveParCode(code: string): Promise<Eleve | undefined>

  /** Met à jour la langue d'interface préférée de l'élève. */
  changerLangueEleve(eleveId: string, langue: Langue): Promise<void>

  /**
   * Ateliers de l'élève pour le camp en cours, triés par date et heure de son groupe,
   * chacun avec ses activités ouvertes (prétest, quiz, post-test, avis) et sa tentative éventuelle.
   */
  ateliersPourEleve(eleveId: string): Promise<AtelierPourEleve[]>

  /** Toutes les activités ouvertes de l'élève, à plat (dans l'ordre des ateliers). */
  sessionsPourEleve(eleveId: string): Promise<SessionPourEleve[]>

  /** Scores prétest et post-test de l'élève pour l'atelier de cette session. */
  progression(sessionId: string, eleveId: string): Promise<Progression>

  /** Fiche et questions d'une session, dans l'ordre, avec leurs choix. */
  chargerSession(sessionId: string): Promise<{ detail: SessionPourEleve; questions: QuestionAvecChoix[] }>

  /** Démarre la tentative, ou reprend celle en cours. Refuse si déjà soumise. */
  demarrerTentative(sessionId: string, eleveId: string, langue: Langue): Promise<{ tentative: Tentative; reponses: Reponse[] }>

  /** Enregistre (ou remplace) la réponse à une question ; la note immédiatement si c'est un QCM. */
  enregistrerReponse(tentativeId: string, questionId: string, saisie: { choix_coches: string[]; texte?: string; temps_ms: number }): Promise<Reponse>

  /** Clôt la tentative et calcule score, score max et temps total. */
  soumettreTentative(tentativeId: string): Promise<{ tentative: Tentative; en_attente: number }>

  /** Tentative d'un élève pour une session, avec le nombre de réponses encore à corriger. */
  tentativeDe(sessionId: string, eleveId: string): Promise<{ tentative: Tentative; en_attente: number } | undefined>

  /** Top N de la session. */
  classement(sessionId: string, limite?: number): Promise<LigneClassement[]>

  /** Fiche seule (en-têtes). */
  fiche(ficheId: string): Promise<Fiche | undefined>
}
