import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { staff } from '../data'
import { nomComplet } from '../lib/droits'
import type { Personnel, Role } from '../types'
import { useStaff } from './contexteStaff'

const libelleRole: Record<Role, string> = {
  super_admin: 'Super-admin CAYSTI',
  admin_camp: 'Admin de camp',
  formateur: 'Formateur',
  lecteur: 'Lecteur',
}

export function ConnexionStaff() {
  const { moi, connecter } = useStaff()
  const [comptes, setComptes] = useState<Personnel[]>()
  const naviguer = useNavigate()

  useEffect(() => { staff.comptesDemo().then(setComptes) }, [])

  if (moi) return <Navigate to="/formateur/groupes" replace />

  return (
    <section className="connexion-staff">
      <h1 className="titre-l">Espace formateur</h1>
      <p className="aide">
        Démo : choisissez un compte. Avec le serveur Supabase, chaque membre du personnel se connectera avec son adresse e-mail.
      </p>
      <ul className="comptes">
        {comptes?.map((p) => (
          <li key={p.id}>
            <button type="button" className="compte" onClick={() => { connecter(p); naviguer('/formateur/groupes') }}>
              <span className="compte-nom">{nomComplet(p)}</span>
              <span className="compte-role">{p.roles.map((r) => libelleRole[r.role]).join(', ')}</span>
              <span className="compte-email">{p.email}</span>
            </button>
          </li>
        ))}
      </ul>
      <Link className="lien" to="/">Retour à l’espace élève</Link>
    </section>
  )
}
