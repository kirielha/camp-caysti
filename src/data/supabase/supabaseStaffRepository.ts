// Espace du personnel branché sur Supabase (supabase/migrations/0006_api_personnel.sql).
// Le paramètre « personnel » des méthodes n'est pas transmis : le serveur sait qui appelle
// grâce à la session et refait lui-même tous les contrôles de droits.

import type { Personnel } from '../../types'
import type { StaffRepository } from '../staffRepository'
import { appeler, clientPersonnel } from './client'
import { etatPilote, surveiller } from './supabaseRepository'

export function creerStaffRepositorySupabase(): StaffRepository {
  const c = () => clientPersonnel()
  const rpc = <T>(fonction: string, args: Record<string, unknown> = {}) => appeler<T>(c(), fonction, args)

  return {
    // ---------- Connexion (voir authPersonnel.ts pour l'e-mail et le mot de passe)
    async comptesDemo() { return [] },
    async personnel() { return (await rpc<Personnel | null>('mon_profil')) ?? undefined },

    // ---------- Pilotage
    groupesPour: () => rpc('groupes_personnel'),
    detailGroupe: (groupeId) => rpc('detail_groupe', { p_groupe: groupeId }),
    vueSession: (sessionId) => rpc('charger_session', { p_session: sessionId }),
    etatPilote: (sessionId) => etatPilote(c(), sessionId),
    classement: (sessionId, limite = 10) => rpc('classement', { p_session: sessionId, p_limite: limite }),
    classementEnDirect: (sessionId, limite = 10) => rpc('classement_en_direct', { p_session: sessionId, p_limite: limite }),
    surveillerSession: (sessionId, f) => surveiller(c(), sessionId, f),
    resultatsSession: (sessionId) => rpc('resultats_session', { p_session: sessionId }),
    changerStatutGroupe: (groupeId, statut) => rpc('changer_statut_groupe', { p_groupe: groupeId, p_statut: statut }),
    changerStatutSession: (sessionId, statut) => rpc('changer_statut_session', { p_session: sessionId, p_statut: statut }),
    changerAffichageClassement: (sessionId, affiche) => rpc('changer_affichage_classement', { p_session: sessionId, p_affiche: affiche }),
    changerModeSession: (sessionId, mode) => rpc('changer_mode_session', { p_session: sessionId, p_mode: mode }),
    piloter: (sessionId, action) => rpc('piloter', { p_session: sessionId, p_action: action }),
    ajouterActivite: (groupeId, ficheId, _p, partieId) => rpc('ajouter_activite', { p_groupe: groupeId, p_fiche: ficheId, p_partie: partieId ?? null }),
    retirerActivite: (sessionId) => rpc('retirer_activite', { p_session: sessionId }),

    // ---------- Fiches
    fichesVisibles: () => rpc('fiches_visibles'),
    chargerFiche: (ficheId) => rpc('charger_fiche', { p_fiche: ficheId }),
    enregistrerFiche: (fiche) => rpc('enregistrer_fiche', { p: fiche }),
    dupliquerFiche: (ficheId) => rpc('dupliquer_fiche', { p_fiche: ficheId }),
    soumettreFiche: (ficheId) => rpc('soumettre_fiche', { p_fiche: ficheId }),
    validerFiche: (ficheId) => rpc('valider_fiche', { p_fiche: ficheId }),
    refuserFiche: (ficheId, commentaire) => rpc('refuser_fiche', { p_fiche: ficheId, p_commentaire: commentaire }),
    supprimerFiche: (ficheId) => rpc('supprimer_fiche', { p_fiche: ficheId }),

    // ---------- Camp
    structureCamp: (campId) => rpc('structure_camp', { p_camp: campId }),
    enregistrerPartie: (saisie) => rpc('enregistrer_partie', { p: saisie }),
    supprimerPartie: (partieId) => rpc('supprimer_partie', { p_partie: partieId }),
    exportResultats: (campId) => rpc('export_resultats', { p_camp: campId }),
    enregistrerAtelier: (atelier) => rpc('enregistrer_atelier', { p: atelier }),
    enregistrerGroupe: (groupe, formateurs) => rpc('enregistrer_groupe', { p_groupe: groupe, p_formateurs: formateurs }),
    supprimerGroupe: (groupeId) => rpc('supprimer_groupe', { p_groupe: groupeId }),
    formateurs: () => rpc('formateurs'),
    elevesDuCamp: (campId) => rpc('eleves_camp', { p_camp: campId }),
    enregistrerEleve: (campId, { eleve, tuteur, groupeIds }) => rpc('enregistrer_eleve', { p_camp: campId, p_eleve: eleve, p_tuteur: tuteur, p_groupes: groupeIds }),
    importerEleves: (campId, lignes, groupeIds, fichier) => rpc('importer_eleves', { p_camp: campId, p_lignes: lignes, p_groupes: groupeIds, p_fichier: fichier }),
    ecoles: () => rpc('ecoles'),
    langues: () => rpc('langues'),
    identitesEleves: () => rpc('identites_eleves'),

    // ---------- Personnel
    listePersonnel: () => rpc('liste_personnel'),
    attribuerRole: (utilisateurId, role, campId) => rpc('attribuer_role', { p_utilisateur: utilisateurId, p_role: role, p_camp: campId ?? null }),
    retirerRole: (roleId) => rpc('retirer_role', { p_role_id: roleId }),
    enregistrerCamp: (camp) => rpc('enregistrer_camp', { p: camp }),

    // ---------- Référentiels
    technologies: () => rpc('technologies'),
    competences: (technologieId) => rpc('competences', { p_technologie: technologieId ?? null }),
    ajouterCompetence: (technologieId, fr, en) => rpc('ajouter_competence', { p_technologie: technologieId, p_libelle_fr: fr, p_libelle_en: en ?? null }),
    camps: () => rpc('camps'),
  }
}
