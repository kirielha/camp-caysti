import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { staff } from '../data'
import { estAdmin, nomComplet } from '../lib/droits'
import { FournisseurStaff, useStaff } from './contexteStaff'

export function EspaceStaff() {
  return (
    <FournisseurStaff>
      <Cadre />
    </FournisseurStaff>
  )
}

function Cadre() {
  const { moi, pret, deconnecter } = useStaff()
  const location = useLocation()
  const naviguer = useNavigate()
  const [aValider, setAValider] = useState(0)

  useEffect(() => {
    if (!moi || !estAdmin(moi)) return
    staff.fichesVisibles(moi).then((f) => setAValider(f.filter((x) => x.fiche.statut_validation === 'soumise').length))
  }, [moi, location.pathname])

  if (!pret) return <p className="aide">Chargement…</p>
  const actif = !!moi && moi.roles.length > 0
  if (!actif && location.pathname !== '/formateur') return <Navigate to="/formateur" replace />

  return (
    <div className="staff">
      {actif && moi && (
        <nav className="staff-nav" aria-label="Espace formateur">
          <div className="staff-nav-liens">
            <NavLink to="/formateur/groupes">Mes groupes</NavLink>
            <NavLink to="/formateur/fiches">Fiches</NavLink>
            {estAdmin(moi) && <NavLink to="/formateur/camp">Camp et élèves</NavLink>}
            {estAdmin(moi) && <NavLink to="/formateur/personnel">Personnel</NavLink>}
            {estAdmin(moi) && (
              <NavLink to="/formateur/validation">
                À valider{aValider > 0 && <span className="pastille" aria-label={`${aValider} en attente`}>{aValider}</span>}
              </NavLink>
            )}
          </div>
          <div className="staff-nav-moi">
            <span>{nomComplet(moi)}</span>
            <button type="button" className="lien" onClick={() => { void deconnecter().then(() => naviguer('/formateur')) }}>Se déconnecter</button>
          </div>
        </nav>
      )}
      <Outlet />
    </div>
  )
}
