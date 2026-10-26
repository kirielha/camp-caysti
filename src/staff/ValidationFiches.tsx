import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { staff } from '../data'
import type { ResumeFiche } from '../data/staffRepository'
import { peutValider } from '../lib/droits'
import { useStaff } from './contexteStaff'
import { libelleType } from './libelles'

export function ValidationFiches() {
  const { moi } = useStaff()
  const [fiches, setFiches] = useState<ResumeFiche[]>()

  useEffect(() => {
    if (moi) staff.fichesVisibles(moi).then((f) => setFiches(f.filter((x) => x.fiche.statut_validation === 'soumise')))
  }, [moi])

  if (!moi) return null
  if (!peutValider(moi)) return <Navigate to="/formateur/groupes" replace />

  return (
    <section>
      <h1 className="titre-l">Fiches à valider</h1>
      <p className="aide">
        Une fiche validée devient officielle : tous les formateurs peuvent la programmer, dans tous les camps.
        Ouvrez une fiche pour la relire, puis validez-la ou renvoyez-la avec une remarque.
      </p>
      {!fiches && <p className="aide">Chargement…</p>}
      {fiches?.length === 0 && <p className="vide">Aucune fiche en attente. Les fiches soumises par les formateurs apparaîtront ici.</p>}
      <ul className="liste-validation">
        {fiches?.map((f) => (
          <li key={f.fiche.id}>
            <Link to={`/formateur/fiches/${f.fiche.id}`} className="carte-validation">
              <span className={`etiquette-type etiquette-${f.fiche.type}`}>{libelleType[f.fiche.type]}</span>
              <span className="carte-validation-titre">{f.fiche.titre_fr}</span>
              <span className="aide">{f.technologie?.nom_fr ?? 'Fiche générale'}, {f.nb_questions} questions, par {f.auteur}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
