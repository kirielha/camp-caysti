// Contrat d'accès aux données. L'interface ne dépend que de ce contrat :
// l'implémentation locale (localRepository) sera complétée par une
// implémentation Supabase sans toucher aux écrans.

import type {
  AtelierPourEleve, Eleve, EtatPilote, Fiche, Langue, LigneClassement, Progression, QuestionAvecChoix, Reponse,
  SessionPourEleve, StatutGroupe, StatutSession, Tentative,
} from '../types'

export type CodeErreur = 'code_inconnu' | 'deja_soumise' | 'session_fermee' | 'non_inscrit' | 'atelier_inactif'
  | 'hors_question' | 'deja_repondu' | 'pas_pilote' | 'session_pilotee'

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
   * Ateliers de l'élève, triés par date et heure de son groupe, chacun avec toutes ses activités
   * (prétest, quiz, post-test, avis) et la tentative éventuelle de l'élève. L'écran décide lesquelles
   * sont accessibles selon le statut du groupe et de chaque session.
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

  // ---------- Mode piloté ----------

  /** L'élève entre dans la salle : il est compté parmi les participants et sa tentative est créée. */
  rejoindreSessionPilotee(sessionId: string, eleveId: string, langue: Langue): Promise<Tentative>

  /**
   * Réponse à la question que le formateur affiche. Refusée si ce n'est plus la question en cours,
   * si le temps est écoulé ou si l'élève a déjà répondu. Le temps de réponse est compté depuis le
   * lancement de la question par le formateur.
   */
  repondrePilote(tentativeId: string, questionId: string, saisie: { choix_coches: string[]; texte?: string }): Promise<Reponse>

  /** État de la partie (question courante, participants, réponses reçues). */
  etatPilote(sessionId: string): Promise<EtatPilote>

  /** Classement calculé sur les réponses déjà notées (pendant la partie, avant la clôture). */
  classementEnDirect(sessionId: string, limite?: number): Promise<LigneClassement[]>

  /**
   * Prévient à chaque changement de la session (étape, question, participants, réponses).
   * Renvoie la fonction d'arrêt. En local : observation de la base ; avec Supabase : canal temps réel.
   */
  surveillerSession(sessionId: string, auChangement: () => void): () => void

  /** Top N de la session. */
  classement(sessionId: string, limite?: number): Promise<LigneClassement[]>

  // ---------- Actions du formateur (utilisées par la démo en attendant l'espace formateur) ----------

  /** Change le statut d'un groupe : a_venir → en_cours → termine. */
  changerStatutGroupe(groupeId: string, statut: StatutGroupe): Promise<void>

  /** Ouvre ou ferme une activité pour son groupe. */
  changerStatutSession(sessionId: string, statut: StatutSession): Promise<void>

  /** Fiche seule (en-têtes). */
  fiche(ficheId: string): Promise<Fiche | undefined>
}
