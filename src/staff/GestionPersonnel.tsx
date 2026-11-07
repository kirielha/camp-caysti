import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { modeDemo, staff } from '../data'
import { ErreurDroits } from '../data/staffRepository'
import { estAdmin, estSuperAdmin, nomComplet } from '../lib/droits'
import type { Camp, Personnel, Role } from '../types'
import { libelleRole } from './ConnexionStaff'
import { useStaff } from './contexteStaff'

/** Comptes du personnel et rôles. Un nouveau compte n'a aucun rôle tant qu'un admin ne lui en donne pas. */
export function GestionPersonnel() {
  const { moi, recharger } = useStaff()
  const [comptes, setComptes] = useState<Personnel[]>()
  const [camps, setCamps] = useState<Camp[]>([])
  const [erreur, setErreur] = useState<string>()

  const charger = useCallback(async () => {
    if (!moi) return
    setComptes(await staff.listePersonnel(moi))
    setCamps(await staff.camps())
  }, [moi])
  useEffect(() => { void charger() }, [charger])

  if (!moi) return null
  if (!estAdmin(moi)) return <Navigate to="/formateur/groupes" replace />

  const agir = async (f: () => Promise<void>) => {
    setErreur(undefined)
    try { await f(); await charger(); if (moi) await recharger() } catch (e) {
      setErreur(e instanceof ErreurDroits ? e.message : 'L’action a échoué.')
    }
  }
  const nomCamp = (id?: string) => (id ? camps.find((c) => c.id === id)?.nom ?? 'camp' : 'tous les camps')
  const sansRole = comptes?.filter((c) => c.roles.length === 0) ?? []
  const avecRole = comptes?.filter((c) => c.roles.length > 0) ?? []

  return (
    <section>
      <h1 className="titre-l">Personnel</h1>
      <p className="aide">
        {modeDemo
          ? 'Démo : les comptes sont fictifs.'
          : 'Chaque membre du personnel crée son compte depuis « Espace formateur » avec son adresse e-mail, puis apparaît ici en attente de rôle.'}
      </p>
      {erreur && <p className="erreur" role="alert">{erreur}</p>}
      {!comptes && <p className="aide">Chargement…</p>}

      {sansRole.length > 0 && (
        <>
          <h2 className="titre-m">En attente d’un rôle ({sansRole.length})</h2>
          <ul className="liste-personnel">
            {sansRole.map((c) => <CartePersonnel key={c.id} c={c} camps={camps} moi={moi} nomCamp={nomCamp} agir={agir} />)}
          </ul>
        </>
      )}

      <h2 className="titre-m">Équipe</h2>
      <ul className="liste-personnel">
        {avecRole.map((c) => <CartePersonnel key={c.id} c={c} camps={camps} moi={moi} nomCamp={nomCamp} agir={agir} />)}
      </ul>
    </section>
  )
}

function CartePersonnel({ c, camps, moi, nomCamp, agir }: {
  c: Personnel; camps: Camp[]; moi: Personnel; nomCamp: (id?: string) => string; agir: (f: () => Promise<void>) => Promise<void>
}) {
  const superAdmin = estSuperAdmin(moi)
  const rolesPossibles: Role[] = superAdmin ? ['formateur', 'admin_camp', 'lecteur', 'super_admin'] : ['formateur', 'lecteur']
  const [role, setRole] = useState<Role>('formateur')
  const [camp, setCamp] = useState(camps[0]?.id ?? '')
  const idBase = `role-${c.id}`

  return (
    <li className="carte-personnel">
      <div>
        <p className="carte-personnel-nom">{nomComplet(c)}</p>
        <p className="aide">{c.email}{c.telephone ? `, ${c.telephone}` : ''}</p>
        <div className="roles">
          {c.roles.length === 0 && <span className="aide">Aucun rôle</span>}
          {c.roles.map((r) => (
            <span key={r.id} className="puce-role">
              {libelleRole[r.role]}{r.role !== 'super_admin' ? ` · ${nomCamp(r.camp_id)}` : ''}
              <button type="button" className="puce-role-retirer" aria-label={`Retirer le rôle ${libelleRole[r.role]}`}
                onClick={() => agir(() => staff.retirerRole(r.id, moi))}>×</button>
            </span>
          ))}
        </div>
      </div>
      <form className="ajout-role" onSubmit={(e) => {
        e.preventDefault()
        void agir(() => staff.attribuerRole(c.id, role, role === 'super_admin' ? undefined : camp || undefined, moi))
      }}>
        <label className="sr-only" htmlFor={`${idBase}-role`}>Rôle</label>
        <select id={`${idBase}-role`} className="champ" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {rolesPossibles.map((r) => <option key={r} value={r}>{libelleRole[r]}</option>)}
        </select>
        {role !== 'super_admin' && (
          <>
            <label className="sr-only" htmlFor={`${idBase}-camp`}>Camp</label>
            <select id={`${idBase}-camp`} className="champ" value={camp} onChange={(e) => setCamp(e.target.value)} required={!superAdmin || role !== 'admin_camp'}>
              {superAdmin && role === 'admin_camp' && <option value="">Tous les camps</option>}
              {camps.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}
            </select>
          </>
        )}
        <button className="bouton">Ajouter le rôle</button>
      </form>
    </li>
  )
}
