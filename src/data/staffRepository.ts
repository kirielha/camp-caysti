// Contrat d'accès aux données de l'espace personnel (formateurs et admins).
// Comme pour l'espace élève, les écrans ne dépendent que de ce contrat.

import type { LigneImport } from '../lib/importEleves'
import type {
  Atelier, AtelierDuCamp, Camp, Choix, Competence, DetailGroupe, Ecole, Eleve, EleveDuCamp, Fiche, Groupe,
  EtatPilote, GroupePourFormateur, LangueParlee, LigneClassement, LigneResultat, ModeSession, Personnel, Question, QuestionAvecChoix, Role,
  SessionPourEleve, StatutGroupe, StatutSession, Technologie, Tuteur, Utilisateur,
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

export interface SaisieCamp {
  id?: string
  nom: string
  pays_code: string
  pays_nom: string
  ville: string
  date_debut: string
  date_fin: string
  lieu?: string
  statut?: Camp['statut']
}

export type ActionPilote = 'suivante' | 'reveler' | 'classement' | 'terminer'

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
  /** Session vue par le formateur : fiche et questions avec les bonnes réponses. */
  vueSession(sessionId: string): Promise<{ detail: SessionPourEleve; questions: QuestionAvecChoix[] }>
  etatPilote(sessionId: string): Promise<EtatPilote>
  classement(sessionId: string, limite?: number): Promise<LigneClassement[]>
  classementEnDirect(sessionId: string, limite?: number): Promise<LigneClassement[]>
  surveillerSession(sessionId: string, auChangement: () => void): () => void
  /** Élèves inscrits au groupe avec leur tentative pour cette session. */
  resultatsSession(sessionId: string): Promise<LigneResultat[]>
  changerStatutGroupe(groupeId: string, statut: StatutGroupe, personnel: Personnel): Promise<void>
  changerStatutSession(sessionId: string, statut: StatutSession, personnel: Personnel): Promise<void>
  changerAffichageClassement(sessionId: string, affiche: boolean, personnel: Personnel): Promise<void>
  /** Libre (chacun à son rythme) ou piloté (le formateur fait défiler). Impossible une fois que des élèves ont commencé. */
  changerModeSession(sessionId: string, mode: ModeSession, personnel: Personnel): Promise<void>
  /**
   * Commandes du mode piloté :
   * - suivante : affiche la question suivante sur tous les écrans et lance le chrono (ou termine après la dernière)
   * - reveler : montre la bonne réponse et la répartition des réponses
   * - classement : affiche le classement intermédiaire
   * - terminer : clôt la partie, calcule les scores et ferme l'activité
   */
  piloter(sessionId: string, action: ActionPilote, personnel: Personnel): Promise<void>
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

  // ---------- Gestion du camp (admins) ----------
  structureCamp(campId: string): Promise<AtelierDuCamp[]>
  enregistrerAtelier(atelier: Atelier, personnel: Personnel): Promise<void>
  /** Crée ou met à jour un groupe et remplace la liste de ses formateurs. */
  enregistrerGroupe(groupe: Omit<Groupe, 'statut'> & { statut?: Groupe['statut'] }, formateurs: { utilisateur_id: string; role: 'principal' | 'secondaire' }[], personnel: Personnel): Promise<void>
  supprimerGroupe(groupeId: string, personnel: Personnel): Promise<void>
  formateurs(): Promise<Utilisateur[]>
  elevesDuCamp(campId: string): Promise<EleveDuCamp[]>
  /** Crée ou met à jour un élève, son parent, et remplace ses inscriptions aux groupes de ce camp. */
  enregistrerEleve(campId: string, saisie: { eleve: Omit<Eleve, 'code_acces'> & { code_acces?: string }; tuteur: Omit<Tuteur, 'id'> & { id?: string }; groupeIds: string[] }, personnel: Personnel): Promise<Eleve>
  /** Importe les lignes valides : crée les nouveaux élèves, rattache ceux déjà connus, les inscrit aux groupes choisis. */
  importerEleves(campId: string, lignes: LigneImport[], groupeIds: string[], fichier: string, personnel: Personnel): Promise<{ crees: Eleve[]; rattaches: Eleve[] }>
  ecoles(): Promise<Ecole[]>
  langues(): Promise<LangueParlee[]>
  /** Élèves déjà connus (tous camps), pour reconnaître ceux qui reviennent lors d'un import. */
  identitesEleves(): Promise<Pick<Eleve, 'id' | 'nom' | 'prenom' | 'date_naissance'>[]>

  // ---------- Personnel (admins) ----------
  listePersonnel(personnel: Personnel): Promise<Personnel[]>
  attribuerRole(utilisateurId: string, role: Role, campId: string | undefined, personnel: Personnel): Promise<void>
  retirerRole(roleId: string, personnel: Personnel): Promise<void>
  /** Crée ou modifie un camp (super-admin). Renvoie son id. */
  enregistrerCamp(camp: SaisieCamp, personnel: Personnel): Promise<string>

  // ---------- Référentiels ----------
  technologies(): Promise<Technologie[]>
  competences(technologieId?: string): Promise<Competence[]>
  ajouterCompetence(technologieId: string, libelle_fr: string, libelle_en?: string): Promise<Competence>
  camps(): Promise<Camp[]>
}
