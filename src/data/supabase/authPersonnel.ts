// Connexion du personnel par e-mail et mot de passe (mode Supabase uniquement).

import type { Personnel } from '../../types'
import { appeler, clientPersonnel } from './client'

const messages: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou mot de passe incorrect.',
  'Email not confirmed': 'Adresse pas encore confirmée : ouvrez le lien reçu par e-mail.',
  'User already registered': 'Un compte existe déjà avec cette adresse : connectez-vous.',
  'Password should be at least 6 characters.': 'Le mot de passe doit contenir au moins 6 caractères.',
}
const traduire = (m: string) => messages[m] ?? (/rate limit/i.test(m) ? 'Trop de tentatives : réessayez dans quelques minutes.' : m)

/** Adresse de retour après un lien reçu par e-mail : la page de l'application elle-même. */
const retour = () => `${window.location.origin}${window.location.pathname}#/formateur`

export async function sessionPersonnelActive(): Promise<boolean> {
  const { data } = await clientPersonnel().auth.getSession()
  return !!data.session && !data.session.user.is_anonymous
}

export async function seConnecter(email: string, motDePasse: string): Promise<void> {
  const { error } = await clientPersonnel().auth.signInWithPassword({ email: email.trim(), password: motDePasse })
  if (error) throw new Error(traduire(error.message))
}

/** Renvoie true si l'adresse doit encore être confirmée par e-mail. */
export async function creerCompte(email: string, motDePasse: string): Promise<boolean> {
  const { data, error } = await clientPersonnel().auth.signUp({ email: email.trim(), password: motDePasse, options: { emailRedirectTo: retour() } })
  if (error) throw new Error(traduire(error.message))
  return !data.session
}

export async function envoyerLienMotDePasse(email: string): Promise<void> {
  const { error } = await clientPersonnel().auth.resetPasswordForEmail(email.trim(), { redirectTo: retour() })
  if (error) throw new Error(traduire(error.message))
}

export async function changerMotDePasse(motDePasse: string): Promise<void> {
  const { error } = await clientPersonnel().auth.updateUser({ password: motDePasse })
  if (error) throw new Error(traduire(error.message))
}

export async function seDeconnecter(): Promise<void> {
  await clientPersonnel().auth.signOut()
}

export async function creerMonProfil(prenom: string, nom: string, telephone?: string): Promise<Personnel> {
  return appeler<Personnel>(clientPersonnel(), 'creer_mon_profil', { p_prenom: prenom, p_nom: nom, p_telephone: telephone ?? null })
}

/** Prévient quand l'utilisateur arrive par un lien « mot de passe oublié ». */
export function surRecuperationMotDePasse(f: () => void) {
  const { data } = clientPersonnel().auth.onAuthStateChange((evenement) => { if (evenement === 'PASSWORD_RECOVERY') f() })
  return () => data.subscription.unsubscribe()
}
