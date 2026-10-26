import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { staff } from '../data'
import { estAdmin } from '../lib/droits'
import type { Camp } from '../types'
import { useStaff } from './contexteStaff'
import { OngletAteliers } from './gestion/OngletAteliers'
import { OngletEleves } from './gestion/OngletEleves'
import { OngletImport } from './gestion/OngletImport'

type Onglet = 'ateliers' | 'eleves' | 'import'

export function GestionCamp() {
  const { moi } = useStaff()
  const [camps, setCamps] = useState<Camp[]>([])
  const [campId, setCampId] = useState<string>()
  const [onglet, setOnglet] = useState<Onglet>('ateliers')
  const [version, setVersion] = useState(0) // relit les onglets après un import

  useEffect(() => {
    staff.camps().then((c) => { setCamps(c); setCampId((id) => id ?? c[0]?.id) })
  }, [])
  const rafraichir = useCallback(() => setVersion((v) => v + 1), [])

  if (!moi) return null
  if (!estAdmin(moi)) return <Navigate to="/formateur/groupes" replace />
  const camp = camps.find((c) => c.id === campId)

  return (
    <section>
      <div className="titre-avec-action">
        <h1 className="titre-l">{camp?.nom ?? 'Camp'}</h1>
        {camps.length > 1 && (
          <select className="champ champ-court" value={campId} onChange={(e) => setCampId(e.target.value)} aria-label="Camp">
            {camps.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        )}
      </div>
      {camp && <p className="aide">Du {new Date(camp.date_debut).toLocaleDateString('fr-FR')} au {new Date(camp.date_fin).toLocaleDateString('fr-FR')}{camp.lieu ? `, ${camp.lieu}` : ''}</p>}

      <div className="onglets" role="tablist">
        {([['ateliers', 'Ateliers et groupes'], ['eleves', 'Élèves'], ['import', 'Importer un fichier Excel']] as [Onglet, string][]).map(([id, libelle]) => (
          <button key={id} type="button" role="tab" aria-selected={onglet === id} onClick={() => setOnglet(id)}>{libelle}</button>
        ))}
      </div>

      {camp && onglet === 'ateliers' && <OngletAteliers key={`a${version}`} camp={camp} />}
      {camp && onglet === 'eleves' && <OngletEleves key={`e${version}`} camp={camp} />}
      {camp && onglet === 'import' && <OngletImport camp={camp} onImporte={() => { rafraichir(); setOnglet('eleves') }} />}
    </section>
  )
}
