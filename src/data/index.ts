import { BaseCamp } from './db'
import { creerRepositoryLocal } from './localRepository'
import { creerStaffRepositoryLocal } from './localStaffRepository'
import type { Repository } from './repository'
import { seedSiVide } from './seed'
import type { StaffRepository } from './staffRepository'
import { creerRepositorySupabase } from './supabase/supabaseRepository'
import { creerStaffRepositorySupabase } from './supabase/supabaseStaffRepository'

/** « local » : démo dans le navigateur ; « supabase » : données partagées sur le serveur. */
export const backend: 'local' | 'supabase' = import.meta.env.VITE_DATA_BACKEND === 'supabase' ? 'supabase' : 'local'
export const modeDemo = backend === 'local'

export const db = new BaseCamp()

export const repo: Repository = backend === 'supabase' ? creerRepositorySupabase() : creerRepositoryLocal(db)

/** Accès aux données de l'espace personnel (formateurs, admins). */
export const staff: StaffRepository = backend === 'supabase' ? creerStaffRepositorySupabase() : creerStaffRepositoryLocal(db)

/** Prépare les données au démarrage (démo en mode local). */
export async function initialiserDonnees() {
  if (backend === 'local') await seedSiVide(db)
}
