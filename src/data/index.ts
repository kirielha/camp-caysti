import { BaseCamp } from './db'
import { creerRepositoryLocal } from './localRepository'
import { creerStaffRepositoryLocal } from './localStaffRepository'
import type { Repository } from './repository'
import { seedSiVide } from './seed'

const backend = import.meta.env.VITE_DATA_BACKEND ?? 'local'

export const db = new BaseCamp()

function creerRepository(): Repository {
  if (backend === 'supabase') {
    // Implémentation à brancher une fois le projet Supabase créé.
    throw new Error('Backend Supabase pas encore branché : utiliser VITE_DATA_BACKEND=local')
  }
  return creerRepositoryLocal(db)
}

export const repo = creerRepository()

/** Accès aux données de l'espace personnel (formateurs, admins). */
export const staff = creerStaffRepositoryLocal(db)

/** Prépare les données au démarrage (démo en mode local). */
export async function initialiserDonnees() {
  if (backend === 'local') await seedSiVide(db)
}
