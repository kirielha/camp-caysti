// Libellés et formats partagés par les écrans de l'espace formateur.
import type { Fiche, StatutGroupe, TypeFiche } from '../types'

export const libelleType: Record<TypeFiche, string> = { pretest: 'Prétest', posttest: 'Post-test', quiz: 'Quiz', satisfaction: 'Avis' }

export const libelleStatutGroupe: Record<StatutGroupe, string> = { a_venir: 'À venir', en_cours: 'En cours', termine: 'Terminé' }

export const libelleValidation: Record<Fiche['statut_validation'], string> = {
  brouillon: 'Brouillon', soumise: 'En attente de validation', validee: 'Officielle', refusee: 'À corriger',
}

export const jourCourt = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
