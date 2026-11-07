import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { backend, staff } from '../data'
import type { Personnel } from '../types'

/**
 * État du compte :
 * - aucun : personne n'est connecté ;
 * - sans_profil : compte e-mail connecté mais fiche personnel pas encore remplie (mode serveur) ;
 * - ok : membre du personnel connu (ses rôles peuvent encore être vides).
 */
type EtatCompte = 'aucun' | 'sans_profil' | 'ok'

interface ContexteStaff {
  moi?: Personnel
  compte: EtatCompte
  pret: boolean
  connecter: (p: Personnel) => void
  recharger: () => Promise<void>
  deconnecter: () => Promise<void>
}

const Ctx = createContext<ContexteStaff | null>(null)
const CLE = 'camp-caysti:personnel'

export function FournisseurStaff({ children }: { children: ReactNode }) {
  const [moi, setMoi] = useState<Personnel>()
  const [compte, setCompte] = useState<EtatCompte>('aucun')
  const [pret, setPret] = useState(false)

  const recharger = useCallback(async () => {
    if (backend === 'supabase') {
      const auth = await import('../data/supabase/authPersonnel')
      if (!(await auth.sessionPersonnelActive())) { setMoi(undefined); setCompte('aucun'); return }
      const p = await staff.personnel('').catch(() => undefined)
      setMoi(p)
      setCompte(p ? 'ok' : 'sans_profil')
      return
    }
    // démo : on garde seulement l'identifiant du compte choisi ; les rôles sont relus à chaque ouverture
    let id: string | null = null
    try { id = sessionStorage.getItem(CLE) } catch { /* stockage indisponible */ }
    const p = id ? await staff.personnel(id) : undefined
    setMoi(p)
    setCompte(p ? 'ok' : 'aucun')
  }, [])

  useEffect(() => { void recharger().finally(() => setPret(true)) }, [recharger])

  const connecter = useCallback((p: Personnel) => {
    setMoi(p)
    setCompte('ok')
    try { sessionStorage.setItem(CLE, p.id) } catch { /* stockage indisponible */ }
  }, [])

  const deconnecter = useCallback(async () => {
    setMoi(undefined)
    setCompte('aucun')
    try { sessionStorage.removeItem(CLE) } catch { /* stockage indisponible */ }
    if (backend === 'supabase') await (await import('../data/supabase/authPersonnel')).seDeconnecter()
  }, [])

  const valeur = useMemo(() => ({ moi, compte, pret, connecter, recharger, deconnecter }), [moi, compte, pret, connecter, recharger, deconnecter])
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>
}

export function useStaff() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStaff hors du FournisseurStaff')
  return c
}
