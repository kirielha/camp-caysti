import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Entete } from './components/Entete'
import { useCamp } from './contexte'
import { Accueil } from './pages/eleve/Accueil'
import { Connexion } from './pages/eleve/Connexion'
import { Passation } from './pages/eleve/Passation'
import { Resultat } from './pages/eleve/Resultat'

function Protege({ children }: { children: ReactNode }) {
  const { eleve } = useCamp()
  return eleve ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <HashRouter>
      <Entete />
      <main className="page">
        <Routes>
          <Route path="/" element={<Connexion />} />
          <Route path="/eleve" element={<Protege><Accueil /></Protege>} />
          <Route path="/eleve/session/:sessionId" element={<Protege><Passation /></Protege>} />
          <Route path="/eleve/session/:sessionId/resultat" element={<Protege><Resultat /></Protege>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </HashRouter>
  )
}
