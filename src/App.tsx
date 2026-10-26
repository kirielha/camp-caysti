import { lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Entete } from './components/Entete'
import { useCamp } from './contexte'
import { Accueil } from './pages/eleve/Accueil'
import { Connexion } from './pages/eleve/Connexion'
import { Passation } from './pages/eleve/Passation'
import { Resultat } from './pages/eleve/Resultat'

const RoutesStaff = lazy(() => import('./staff/RoutesStaff'))

function Protege({ children }: { children: ReactNode }) {
  const { eleve } = useCamp()
  return eleve ? children : <Navigate to="/" replace />
}

/** L'espace formateur, plus dense, occupe une colonne plus large que l'espace élève. */
function Page({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <main className={`page${pathname.startsWith('/formateur') ? ' page-large' : ''}`}>{children}</main>
}

export default function App() {
  return (
    <HashRouter>
      <Entete />
      <Page>
        <Routes>
          <Route path="/" element={<Connexion />} />
          <Route path="/eleve" element={<Protege><Accueil /></Protege>} />
          <Route path="/eleve/session/:sessionId" element={<Protege><Passation /></Protege>} />
          <Route path="/eleve/session/:sessionId/resultat" element={<Protege><Resultat /></Protege>} />
          <Route path="/formateur/*" element={<Suspense fallback={<p className="aide">Chargement…</p>}><RoutesStaff /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Page>
    </HashRouter>
  )
}
