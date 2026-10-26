import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { repo } from './data'
import { textes, type Textes } from './i18n/textes'
import type { Eleve, Langue } from './types'

interface Contexte {
  eleve?: Eleve
  langue: Langue
  t: Textes
  connecter: (eleve: Eleve) => void
  deconnecter: () => void
  changerLangue: (l: Langue) => void
  enLigne: boolean
}

const Ctx = createContext<Contexte | null>(null)
const CLE = 'camp-caysti:eleve'

// L'élève est gardé en sessionStorage : une tablette partagée oublie l'élève
// dès que l'onglet est fermé, sans exposer ses résultats au suivant.
function lire<T>(cle: string): T | undefined {
  try {
    const v = sessionStorage.getItem(cle)
    return v ? (JSON.parse(v) as T) : undefined
  } catch {
    return undefined
  }
}

export function FournisseurContexte({ children }: { children: ReactNode }) {
  const [eleve, setEleve] = useState<Eleve | undefined>(() => lire<Eleve>(CLE))
  const [langue, setLangue] = useState<Langue>(() => lire<Eleve>(CLE)?.langue_interface ?? 'fr')
  const [enLigne, setEnLigne] = useState(navigator.onLine)

  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine)
    window.addEventListener('online', maj)
    window.addEventListener('offline', maj)
    return () => {
      window.removeEventListener('online', maj)
      window.removeEventListener('offline', maj)
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = langue
  }, [langue])

  const connecter = useCallback((e: Eleve) => {
    setEleve(e)
    setLangue(e.langue_interface)
    try { sessionStorage.setItem(CLE, JSON.stringify(e)) } catch { /* stockage indisponible */ }
  }, [])

  const deconnecter = useCallback(() => {
    setEleve(undefined)
    try { sessionStorage.removeItem(CLE) } catch { /* stockage indisponible */ }
  }, [])

  const changerLangue = useCallback((l: Langue) => {
    setLangue(l)
    if (eleve) {
      const maj = { ...eleve, langue_interface: l }
      setEleve(maj)
      try { sessionStorage.setItem(CLE, JSON.stringify(maj)) } catch { /* stockage indisponible */ }
      void repo.changerLangueEleve(eleve.id, l)
    }
  }, [eleve])

  const valeur = useMemo(
    () => ({ eleve, langue, t: textes[langue], connecter, deconnecter, changerLangue, enLigne }),
    [eleve, langue, connecter, deconnecter, changerLangue, enLigne],
  )
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>
}

export function useCamp() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCamp hors du FournisseurContexte')
  return c
}
