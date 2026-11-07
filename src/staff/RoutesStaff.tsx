// Espace formateur, chargé à la demande : les élèves (souvent en connexion lente)
// ne téléchargent ni ces écrans ni les bibliothèques Excel.
import { Route, Routes } from 'react-router-dom'
import { AnimationDirect } from './AnimationDirect'
import { BanqueFiches } from './BanqueFiches'
import { ConnexionStaff } from './ConnexionStaff'
import { EditeurFiche } from './EditeurFiche'
import { GestionCamp } from './GestionCamp'
import { GestionPersonnel } from './GestionPersonnel'
import { MesGroupes } from './MesGroupes'
import { PilotageGroupe } from './PilotageGroupe'
import { ResultatsSession } from './ResultatsSession'
import { EspaceStaff } from './StaffLayout'
import { ValidationFiches } from './ValidationFiches'

export default function RoutesStaff() {
  return (
    <Routes>
      <Route element={<EspaceStaff />}>
        <Route index element={<ConnexionStaff />} />
        <Route path="groupes" element={<MesGroupes />} />
        <Route path="groupe/:groupeId" element={<PilotageGroupe />} />
        <Route path="session/:sessionId" element={<ResultatsSession />} />
        <Route path="direct/:sessionId" element={<AnimationDirect />} />
        <Route path="fiches" element={<BanqueFiches />} />
        <Route path="fiches/nouvelle" element={<EditeurFiche />} />
        <Route path="fiches/:ficheId" element={<EditeurFiche />} />
        <Route path="validation" element={<ValidationFiches />} />
        <Route path="camp" element={<GestionCamp />} />
        <Route path="personnel" element={<GestionPersonnel />} />
      </Route>
    </Routes>
  )
}
