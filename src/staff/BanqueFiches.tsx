import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { staff } from '../data'
import type { ResumeFiche } from '../data/staffRepository'
import type { Technologie, TypeFiche } from '../types'
import { useStaff } from './contexteStaff'
import { libelleType, libelleValidation } from './libelles'

type Filtre = 'toutes' | 'miennes' | 'officielles'

export function BanqueFiches() {
  const { moi } = useStaff()
  const naviguer = useNavigate()
  const [fiches, setFiches] = useState<ResumeFiche[]>()
  const [technos, setTechnos] = useState<Technologie[]>([])
  const [filtre, setFiltre] = useState<Filtre>('toutes')
  const [type, setType] = useState<TypeFiche | ''>('')
  const [techno, setTechno] = useState('')
  const [recherche, setRecherche] = useState('')

  useEffect(() => {
    if (!moi) return
    staff.fichesVisibles(moi).then(setFiches)
    staff.technologies().then(setTechnos)
  }, [moi])

  const visibles = useMemo(() => (fiches ?? [])
    .filter((f) => filtre === 'toutes' || (filtre === 'miennes' ? f.fiche.auteur_id === moi?.id : f.fiche.statut_validation === 'validee'))
    .filter((f) => !type || f.fiche.type === type)
    .filter((f) => !techno || f.fiche.technologie_id === techno)
    .filter((f) => !recherche.trim() || f.fiche.titre_fr.toLowerCase().includes(recherche.trim().toLowerCase()))
    .sort((a, b) => (a.technologie?.nom_fr ?? 'zz').localeCompare(b.technologie?.nom_fr ?? 'zz') || a.fiche.titre_fr.localeCompare(b.fiche.titre_fr)),
  [fiches, filtre, type, techno, recherche, moi])

  if (!moi) return null

  return (
    <section>
      <div className="titre-avec-action">
        <h1 className="titre-l">Banque de fiches</h1>
        <Link className="bouton bouton-principal" to="/formateur/fiches/nouvelle">Créer une fiche</Link>
      </div>
      <p className="aide">
        Les fiches officielles servent dans tous les camps. Vos brouillons restent privés jusqu’à ce que vous les partagiez
        ou les soumettiez à un admin.
      </p>

      <div className="filtres">
        <div className="segments" role="group" aria-label="Afficher">
          {(['toutes', 'miennes', 'officielles'] as Filtre[]).map((f) => (
            <button key={f} type="button" aria-pressed={filtre === f} onClick={() => setFiltre(f)}>
              {{ toutes: 'Toutes', miennes: 'Mes fiches', officielles: 'Officielles' }[f]}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="filtre-type">Type</label>
        <select id="filtre-type" className="champ champ-court" value={type} onChange={(e) => setType(e.target.value as TypeFiche | '')}>
          <option value="">Tous les types</option>
          {(Object.keys(libelleType) as TypeFiche[]).map((t) => <option key={t} value={t}>{libelleType[t]}</option>)}
        </select>
        <label className="sr-only" htmlFor="filtre-techno">Technologie</label>
        <select id="filtre-techno" className="champ champ-court" value={techno} onChange={(e) => setTechno(e.target.value)}>
          <option value="">Toutes les technologies</option>
          {technos.map((t) => <option key={t.id} value={t.id}>{t.nom_fr}</option>)}
        </select>
        <label className="sr-only" htmlFor="filtre-recherche">Rechercher</label>
        <input id="filtre-recherche" className="champ" type="search" placeholder="Rechercher un titre…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      </div>

      {!fiches && <p className="aide">Chargement…</p>}
      {fiches && visibles.length === 0 && <p className="vide">Aucune fiche ne correspond à ces filtres.</p>}

      <div className="tableau-defilant">
        <table className="tableau tableau-fiches">
          <thead>
            <tr><th>Fiche</th><th>Type</th><th>Technologie</th><th className="nombre">Questions</th><th>État</th><th>Auteur</th><th><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.fiche.id}>
                <td><Link className="lien-fiche" to={`/formateur/fiches/${f.fiche.id}`}>{f.fiche.titre_fr}</Link></td>
                <td>{libelleType[f.fiche.type]}</td>
                <td>{f.technologie?.nom_fr ?? '—'}</td>
                <td className="nombre">{f.nb_questions}</td>
                <td>
                  <span className={`etat-fiche etat-fiche-${f.fiche.statut_validation}`}>{libelleValidation[f.fiche.statut_validation]}</span>
                  {f.fiche.visibilite === 'partagee' && f.fiche.statut_validation !== 'validee' && <span className="aide"> partagée</span>}
                </td>
                <td>{f.auteur}</td>
                <td>
                  <button type="button" className="lien" onClick={async () => naviguer(`/formateur/fiches/${await staff.dupliquerFiche(f.fiche.id, moi)}`)}>
                    Dupliquer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
