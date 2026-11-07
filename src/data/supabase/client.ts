// Clients Supabase. Deux sessions distinctes, chacune avec son propre stockage :
// - élève : session anonyme gardée le temps de l'onglet (tablettes partagées : l'élève
//   suivant ne retrouve pas la session du précédent) ;
// - personnel : compte e-mail gardé sur l'appareil, comme une application habituelle.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CODES_ERREUR, ErreurMetier, type CodeErreur } from '../repository'
import { ErreurDroits } from '../staffRepository'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const cle = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function stockage(type: 'session' | 'local') {
  // Les navigateurs privés ou verrouillés peuvent refuser le stockage : on retombe sur la mémoire
  const memoire = new Map<string, string>()
  const acces = () => { try { return type === 'session' ? window.sessionStorage : window.localStorage } catch { return undefined } }
  return {
    getItem: (k: string) => { try { return acces()?.getItem(k) ?? memoire.get(k) ?? null } catch { return memoire.get(k) ?? null } },
    setItem: (k: string, v: string) => { try { acces()?.setItem(k, v) } catch { /* mémoire seule */ } memoire.set(k, v) },
    removeItem: (k: string) => { try { acces()?.removeItem(k) } catch { /* mémoire seule */ } memoire.delete(k) },
  }
}

let eleve: SupabaseClient | undefined
let personnel: SupabaseClient | undefined

function verifierConfiguration() {
  if (!url || !cle) throw new Error('VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être renseignées (voir .env.example)')
}

export function clientEleve(): SupabaseClient {
  verifierConfiguration()
  eleve ??= createClient(url!, cle!, {
    auth: { storage: stockage('session'), storageKey: 'camp-caysti-eleve', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return eleve
}

export function clientPersonnel(): SupabaseClient {
  verifierConfiguration()
  personnel ??= createClient(url!, cle!, {
    auth: { storage: stockage('local'), storageKey: 'camp-caysti-personnel', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  })
  return personnel
}

/** Session anonyme de la tablette (créée au besoin). Elle sera rattachée à un élève par son code. */
export async function assurerSessionEleve() {
  const c = clientEleve()
  const { data } = await c.auth.getSession()
  if (data.session) return
  const { error } = await c.auth.signInAnonymously()
  if (error) throw estErreurReseau(error) ? new ErreurMetier('reseau') : new Error(error.message)
}

export async function deconnecterEleve() {
  await clientEleve().auth.signOut({ scope: 'local' })
}

function estErreurReseau(e: unknown) {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
  return /fetch|network|réseau|Failed to fetch|Load failed|NetworkError|timeout/i.test(m)
}

/** Traduit une erreur renvoyée par les fonctions SQL en erreur de l'application. */
export function traduireErreur(e: { message?: string } | Error): Error {
  const message = e.message ?? ''
  if (message.startsWith('droits:')) return new ErreurDroits(message.slice('droits:'.length))
  if ((CODES_ERREUR as string[]).includes(message)) return new ErreurMetier(message as CodeErreur)
  if (estErreurReseau(e)) return new ErreurMetier('reseau', 'Connexion au serveur impossible')
  return new Error(message || 'Erreur du serveur')
}

/** Appelle une fonction SQL et renvoie son résultat, ou lève une erreur traduite. */
export async function appeler<T>(client: SupabaseClient, fonction: string, args: Record<string, unknown> = {}): Promise<T> {
  let reponse
  try {
    reponse = await client.rpc(fonction, args)
  } catch (e) {
    throw traduireErreur(e as Error)
  }
  if (reponse.error) throw traduireErreur(reponse.error)
  return reponse.data as T
}
