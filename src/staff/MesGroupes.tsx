import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { staff } from '../data'
import { estAdmin } from '../lib/droits'
import type { GroupePourFormateur } from '../types'
import { useStaff } from './contexteStaff'
import { jourCourt, libelleStatutGroupe } from './libelles'

export function MesGroupes() {
  const { moi } = useStaff()
  const [groupes, setGroupes] = useState<GroupePourFormateur[]>()

  useEffect(() => { if (moi) staff.groupesPour(moi).then(setGroupes) }, [moi])
  if (!moi) return null

  // regroupement par jour
  const parJour = new Map<string, GroupePourFormateur[]>()
  for (const g of groupes ?? []) parJour.set(g.groupe.date, [...(parJour.get(g.groupe.date) ?? []), g])

  return (
    <section>
      <h1 className="titre-l">{estAdmin(moi) ? 'Groupes du camp' : 'Mes groupes'}</h1>
      {!groupes && <p className="aide">Chargement…</p>}
      {groupes?.length === 0 && (
        <p className="vide">Aucun groupe ne vous est encore affecté. Un admin du camp vous ajoutera comme formateur d’un groupe.</p>
      )}
      {[...parJour.entries()].map(([jour, liste]) => (
        <div key={jour} className="jour">
          <h2 className="titre-m jour-titre">{jourCourt(jour)}</h2>
          <ul className="cartes-groupes">
            {liste.map((g) => (
              <li key={g.groupe.id}>
                <Link to={`/formateur/groupe/${g.groupe.id}`} className="carte-groupe" style={{ ['--techno' as string]: g.technologie.couleur }}>
                  <span className="carte-groupe-haut">
                    <span className={`etiquette-statut etiquette-statut-${g.groupe.statut}`}>{libelleStatutGroupe[g.groupe.statut]}</span>
                    <span className="carte-groupe-heure">{g.groupe.heure_debut}–{g.groupe.heure_fin}</span>
                  </span>
                  <span className="carte-groupe-titre">{g.atelier.titre_fr}</span>
                  <span className="aide">{g.technologie.nom_fr}, {g.groupe.nom}{g.groupe.salle ? `, ${g.groupe.salle}` : ''}</span>
                  <span className="carte-groupe-bas">
                    <span>{g.nb_eleves} élèves</span>
                    {g.role && <span>Formateur {g.role}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
