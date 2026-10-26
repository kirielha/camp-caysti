// Types du domaine — mêmes noms de champs que les tables PostgreSQL
// (supabase/migrations/0001_schema.sql), pour passer du stockage local
// à Supabase sans transformation.

export type Langue = 'fr' | 'en'
export type Classe = 'CE1' | 'CE2' | 'CM1' | 'CM2' | '6e' | '5e' | '4e' | '3e' | '2nde' | '1ere' | 'Tle'
export type TypeFiche = 'pretest' | 'posttest' | 'quiz' | 'satisfaction'
export type ModeCorrection = 'ia_definitive' | 'ia_puis_formateur'
export type TypeQuestion = 'qcm_unique' | 'qcm_multiple' | 'qro_ia' | 'qro_qualitative' | 'echelle'
export type ModeBareme = 'tout_ou_rien' | 'proportionnel'
export type ModeSession = 'libre' | 'pilote'
export type StatutSession = 'brouillon' | 'ouverte' | 'fermee'
export type StatutTentative = 'en_cours' | 'soumise' | 'expiree'
export type StatutCorrection = 'en_attente' | 'ia' | 'validee' | 'modifiee' | 'auto'

export interface Camp {
  id: string
  ville_id: string
  nom: string
  date_debut: string
  date_fin: string
  lieu?: string
  statut: 'preparation' | 'en_cours' | 'termine'
}

export interface Technologie {
  id: string
  nom_fr: string
  nom_en: string
  couleur?: string
}

export interface Atelier {
  id: string
  camp_id: string
  technologie_id: string
  titre_fr: string
  titre_en?: string
  image?: string
}

export interface Groupe {
  id: string
  atelier_id: string
  nom: string
  date: string
  heure_debut: string
  heure_fin: string
  salle?: string
}

export interface Eleve {
  id: string
  code_acces: string
  nom: string
  prenom: string
  date_naissance: string
  sexe: 'F' | 'M'
  classe: Classe
  ecole_id?: string
  langue_id?: string
  langue_autre?: string
  langue_interface: Langue
}

export interface Inscription {
  id: string
  eleve_id: string
  groupe_id: string
  inscrit_le: string
  present?: boolean
}

export interface Competence {
  id: string
  technologie_id: string
  libelle_fr: string
  libelle_en?: string
}

export interface Fiche {
  id: string
  titre_fr: string
  titre_en?: string
  type: TypeFiche
  technologie_id?: string
  mode_correction: ModeCorrection
  visibilite: 'privee' | 'partagee' | 'officielle'
  statut_validation: 'brouillon' | 'soumise' | 'validee' | 'refusee'
  fiche_jumelle_id?: string
  auteur_id: string
  version: number
}

export interface Question {
  id: string
  type: TypeQuestion
  enonce_fr: string
  enonce_en?: string
  image?: string
  duree_secondes: number
  points: number
  mode_bareme: ModeBareme
  reponse_attendue_fr?: string
  reponse_attendue_en?: string
  criteres_correction?: string
  competence_id?: string
  question_jumelle_id?: string
  auteur_id: string
}

export interface Choix {
  id: string
  question_id: string
  texte_fr: string
  texte_en?: string
  image?: string
  est_correct: boolean
  ordre: number
}

export interface FicheQuestion {
  fiche_id: string
  question_id: string
  ordre: number
}

export interface SessionEvaluation {
  id: string
  fiche_id: string
  groupe_id: string
  mode: ModeSession
  mode_correction: ModeCorrection
  statut: StatutSession
  classement_affiche: boolean
  etape: 'attente' | 'question' | 'revelation' | 'classement' | 'terminee'
  question_courante_id?: string
  question_lancee_le?: string
  ouverte_le?: string
  fermee_le?: string
}

export interface Tentative {
  id: string
  session_id: string
  eleve_id: string
  langue: Langue
  debut: string
  fin?: string
  score?: number
  score_max?: number
  temps_total_ms?: number
  statut: StatutTentative
  synchronisee_le?: string
}

export interface Reponse {
  id: string
  tentative_id: string
  question_id: string
  choix_coches: string[]
  texte?: string
  score_ia?: number
  justification_ia?: string
  score_final?: number
  statut_correction: StatutCorrection
  temps_ms?: number
}

// Vues composées utilisées par l'interface
export interface QuestionAvecChoix extends Question {
  choix: Choix[]
  ordre: number
}

export interface SessionPourEleve {
  session: SessionEvaluation
  fiche: Fiche
  atelier: Atelier
  groupe: Groupe
  technologie: Technologie
  tentative?: Tentative
}

/** Un atelier de l'élève (via son groupe), avec ses activités ouvertes dans l'ordre du déroulé. */
export interface AtelierPourEleve {
  atelier: Atelier
  groupe: Groupe
  technologie: Technologie
  activites: SessionPourEleve[]
}

/** Comparaison prétest / post-test d'un même atelier pour un élève. */
export interface Progression {
  pretest?: { score: number; score_max: number }
  posttest?: { score: number; score_max: number }
}

export interface LigneClassement {
  rang: number
  eleve_id: string
  nom_affiche: string
  score: number
  temps_total_ms: number
}
