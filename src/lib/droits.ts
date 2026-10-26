// Règles de droits de l'espace personnel. Elles seront doublées par des
// politiques RLS côté Supabase ; ici elles pilotent l'interface et la démo.

import type { Fiche, Personnel } from '../types'

export const estSuperAdmin = (p: Personnel) => p.roles.some((r) => r.role === 'super_admin')

/** Admin de ce camp (ou de tous les camps). */
export const estAdminCamp = (p: Personnel, campId?: string) =>
  estSuperAdmin(p) || p.roles.some((r) => r.role === 'admin_camp' && (!r.camp_id || !campId || r.camp_id === campId))

export const estAdmin = (p: Personnel) => estSuperAdmin(p) || p.roles.some((r) => r.role === 'admin_camp')

/** Seuls les admins valident les fiches et les rendent officielles. */
export const peutValider = (p: Personnel) => estAdmin(p)

/** Une fiche est visible si elle est officielle ou partagée, si on en est l'auteur, ou si on est admin. */
export const ficheVisible = (f: Fiche, p: Personnel) =>
  f.visibilite !== 'privee' || f.auteur_id === p.id || (estAdmin(p) && f.statut_validation === 'soumise')

/** L'auteur modifie sa fiche tant qu'elle n'est pas officielle ; un admin peut toujours corriger. */
export const peutModifierFiche = (f: Fiche, p: Personnel) =>
  estAdmin(p) || (f.auteur_id === p.id && f.statut_validation !== 'validee')

/**
 * Fiches qu'on peut programmer dans un groupe : les officielles, et ses propres fiches
 * (pour les essayer avec son groupe avant de les faire valider).
 */
export const peutProgrammer = (f: Fiche, p: Personnel) =>
  f.statut_validation === 'validee' || f.auteur_id === p.id

export const nomComplet = (p: { prenom: string; nom: string }) => `${p.prenom} ${p.nom}`
