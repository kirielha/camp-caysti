import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Entete } from './components/Entete'
import { useCamp } from './contexte'
import { Accueil } from './pages/eleve/Accueil'
import { Connexion } from './pages/eleve/Connexion'
import { Passation } from './pages/eleve/Passation'
import { Resultat } from './pages/eleve/Resultat'
import { ConnexionStaff } from './staff/ConnexionStaff'
import { MesGroupes } from './staff/MesGroupes'
import { PilotageGroupe } from './staff/PilotageGroupe'
import { ResultatsSession } from './staff/ResultatsSession'
import { EspaceStaff } from './staff/StaffLayout'

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
          <Route path="/formateur" element={<EspaceStaff />}>
            <Route index element={<ConnexionStaff />} />
            <Route path="groupes" element={<MesGroupes />} />
            <Route path="groupe/:groupeId" element={<PilotageGroupe />} />
            <Route path="session/:sessionId" element={<ResultatsSession />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Page>
    </HashRouter>
  )
}
