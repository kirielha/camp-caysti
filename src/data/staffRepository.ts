// Contrat d'accès aux données de l'espace personnel (formateurs et admins).
// Comme pour l'espace élève, les écrans ne dépendent que de ce contrat.

import type {
  Camp, Choix, Competence, DetailGroupe, Fiche, GroupePourFormateur, LigneResultat, Personnel,
  Question, StatutGroupe, StatutSession, Technologie,
} from '../types'

/** Question telle qu'éditée dans l'éditeur de fiches (avec ses choix). */
export interface QuestionEditable extends Omit<Question, 'auteur_id'> {
  choix: Choix[]
}

/** Fiche complète pour l'éditeur. */
export interface FicheEditable {
  fiche: Fiche
  questions: QuestionEditable[]
}

export interface ResumeFiche {
  fiche: Fiche
  auteur: string
  technologie?: Technologie
  nb_questions: number
  /** Nombre de sessions qui utilisent cette fiche (une fiche utilisée ne doit plus changer de contenu). */
  nb_sessions: number
}

export class ErreurDroits extends Error {
  constructor(message = 'Action non autorisée pour ce compte') {
    super(message)
  }
}

export interface StaffRepository {
  // ---------- Connexion ----------
  /** Comptes proposés sur l'écran de connexion de démo (mode local uniquement). */
  comptesDemo(): Promise<Personnel[]>
  personnel(utilisateurId: string): Promise<Personnel | undefined>

  // ---------- Pilotage ----------
  /** Groupes du formateur ; pour un admin, tous les groupes de sa portée. */
  groupesPour(personnel: Personnel): Promise<GroupePourFormateur[]>
  detailGroupe(groupeId: string, personnel: Personnel): Promise<DetailGroupe>
  /** Élèves inscrits au groupe avec leur tentative pour cette session. */
  resultatsSession(sessionId: string): Promise<LigneResultat[]>
  changerStatutGroupe(groupeId: string, statut: StatutGroupe, personnel: Personnel): Promise<void>
  changerStatutSession(sessionId: string, statut: StatutSession, personnel: Personnel): Promise<void>
  changerAffichageClassement(sessionId: string, affiche: boolean, personnel: Personnel): Promise<void>
  /** Programme une fiche dans un groupe (session en brouillon, à ouvrir le moment venu). */
  ajouterActivite(groupeId: string, ficheId: string, personnel: Personnel): Promise<void>
  retirerActivite(sessionId: string, personnel: Personnel): Promise<void>

  // ---------- Banque de fiches ----------
  /** Fiches visibles : officielles, partagées, et les siennes ; un admin voit aussi les fiches soumises. */
  fichesVisibles(personnel: Personnel): Promise<ResumeFiche[]>
  chargerFiche(ficheId: string): Promise<FicheEditable>
  /** Crée ou met à jour une fiche et ses questions (brouillon de son auteur). Renvoie l'id de la fiche. */
  enregistrerFiche(fiche: FicheEditable, personnel: Personnel): Promise<string>
  dupliquerFiche(ficheId: string, personnel: Personnel): Promise<string>
  soumettreFiche(ficheId: string, personnel: Personnel): Promise<void>
  validerFiche(ficheId: string, personnel: Personnel): Promise<void>
  refuserFiche(ficheId: string, commentaire: string, personnel: Personnel): Promise<void>
  supprimerFiche(ficheId: string, personnel: Personnel): Promise<void>

  // ---------- Référentiels ----------
  technologies(): Promise<Technologie[]>
  competences(technologieId?: string): Promise<Competence[]>
  ajouterCompetence(technologieId: string, libelle_fr: string, libelle_en?: string): Promise<Competence>
  camps(): Promise<Camp[]>
}
