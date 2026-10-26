import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { staff } from '../data'
import type { Personnel } from '../types'

interface ContexteStaff {
  moi?: Personnel
  pret: boolean
  connecter: (p: Personnel) => void
  deconnecter: () => void
}

const Ctx = createContext<ContexteStaff | null>(null)
const CLE = 'camp-caysti:personnel'

export function FournisseurStaff({ children }: { children: ReactNode }) {
  const [moi, setMoi] = useState<Personnel>()
  const [pret, setPret] = useState(false)

  // On ne garde que l'identifiant ; les rôles sont relus à chaque ouverture
  useEffect(() => {
    let id: string | null = null
    try { id = sessionStorage.getItem(CLE) } catch { /* stockage indisponible */ }
    if (!id) { setPret(true); return }
    staff.personnel(id).then((p) => { setMoi(p); setPret(true) })
  }, [])

  const connecter = useCallback((p: Personnel) => {
    setMoi(p)
    try { sessionStorage.setItem(CLE, p.id) } catch { /* stockage indisponible */ }
  }, [])

  const deconnecter = useCallback(() => {
    setMoi(undefined)
    try { sessionStorage.removeItem(CLE) } catch { /* stockage indisponible */ }
  }, [])

  const valeur = useMemo(() => ({ moi, pret, connecter, deconnecter }), [moi, pret, connecter, deconnecter])
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>
}

export function useStaff() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStaff hors du FournisseurStaff')
  return c
}
