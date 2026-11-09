import { useCallback, useEffect, useState } from 'react'
import { staff } from '../../data'
import { ErreurDroits, type ResumeFiche } from '../../data/staffRepository'
import { telechargerCodes } from '../../lib/exportsExcel'
import { nomComplet } from '../../lib/droits'
import { nouvelId } from '../../lib/ids'
import type { AtelierDuCamp, Camp, Groupe, Technologie, Utilisateur } from '../../types'
import { useStaff } from '../contexteStaff'
import { jourCourt, libelleStatutGroupe } from '../libelles'
import { PartiesAtelier } from './PartiesAtelier'

type GroupeEnEdition = { groupe: Omit<Groupe, 'statut'> & { statut?: Groupe['statut'] }; principal: string; secondaires: string[] }

export function OngletAteliers({ camp }: { camp: Camp }) {
  const { moi } = useStaff()
  const [structure, setStructure] = useState<AtelierDuCamp[]>()
  const [technos, setTechnos] = useState<Technologie[]>([])
  const [formateurs, setFormateurs] = useState<Utilisateur[]>([])
  const [fiches, setFiches] = useState<ResumeFiche[]>([])
  const [edition, setEdition] = useState<GroupeEnEdition>()
  const [nouvelAtelier, setNouvelAtelier] = useState<{ technologie_id: string; titre_fr: string; titre_en: string }>()
  const [erreur, setErreur] = useState<string>()

  const charger = useCallback(() => staff.structureCamp(camp.id).then(setStructure), [camp.id])
  useEffect(() => {
    void charger()
    staff.technologies().then(setTechnos)
    staff.formateurs().then(setFormateurs)
  }, [charger])
  useEffect(() => { if (moi) staff.fichesVisibles(moi).then(setFiches) }, [moi])

  if (!moi || !structure) return <p className="aide">Chargement…</p>

  const agir = async (f: () => Promise<void>) => {
    setErreur(undefined)
    try { await f(); await charger(); return true } catch (e) {
      setErreur(e instanceof ErreurDroits ? e.message : 'L’action a échoué.')
      return false
    }
  }

  const editerGroupe = (atelierId: string, existant?: AtelierDuCamp['groupes'][number]) => setEdition(existant
    ? {
        groupe: existant.groupe,
        principal: existant.formateurs.find((f) => f.role === 'principal')?.utilisateur.id ?? '',
        secondaires: existant.formateurs.filter((f) => f.role === 'secondaire').map((f) => f.utilisateur.id),
      }
    : { groupe: { id: nouvelId(), atelier_id: atelierId, nom: '', date: camp.date_debut, heure_debut: '09:00', heure_fin: '12:00', salle: '' }, principal: '', secondaires: [] })

  return (
    <div className="onglet-contenu">
      {erreur && <p className="erreur" role="alert">{erreur}</p>}
      {structure.length === 0 && <p className="vide">Aucun atelier dans ce camp. Commencez par en ajouter un.</p>}

      {structure.map((a) => (
        <article key={a.atelier.id} className="bloc-gestion" style={{ ['--techno' as string]: a.technologie.couleur }}>
          <header className="bloc-gestion-entete">
            <div>
              <p className="aide">{a.technologie.nom_fr}</p>
              <h2 className="titre-m">{a.atelier.titre_fr}</h2>
            </div>
            <button type="button" className="bouton" onClick={() => editerGroupe(a.atelier.id)}>Ajouter un groupe</button>
          </header>
          <PartiesAtelier a={a} fiches={fiches} moi={moi} onChange={charger} />
          <p className="sous-titre-gestion">Groupes</p>
          {a.groupes.length === 0 && <p className="aide">Aucun groupe : ajoutez-en un pour y inscrire des élèves.</p>}
          <ul className="groupes-gestion">
            {a.groupes.map((g) => (
              <li key={g.groupe.id}>
                {edition?.groupe.id === g.groupe.id ? null : (
                  <div className="groupe-gestion">
                    <div>
                      <p className="groupe-gestion-titre">
                        {g.groupe.nom} <span className={`etiquette-statut etiquette-statut-${g.groupe.statut}`}>{libelleStatutGroupe[g.groupe.statut]}</span>
                      </p>
                      <p className="aide">
                        <span className="majuscule">{jourCourt(g.groupe.date)}</span>, {g.groupe.heure_debut}–{g.groupe.heure_fin}{g.groupe.salle ? `, ${g.groupe.salle}` : ''}, {g.nb_eleves} élèves
                      </p>
                      <p className="aide">
                        {g.formateurs.length
                          ? g.formateurs.map((f) => `${nomComplet(f.utilisateur)} (${f.role})`).join(', ')
                          : 'Aucun formateur affecté'}
                      </p>
                    </div>
                    <div className="groupe-gestion-actions">
                      {g.nb_eleves > 0 && (
                        <button type="button" className="lien" onClick={() => agir(async () => {
                          const d = await staff.detailGroupe(g.groupe.id, moi)
                          await telechargerCodes(d.eleves, a.atelier.titre_fr, g.groupe.nom, g.groupe.date)
                        })}>Codes (Excel)</button>
                      )}
                      <button type="button" className="lien" onClick={() => editerGroupe(a.atelier.id, g)}>Modifier</button>
                      <button type="button" className="lien lien-danger" onClick={() => agir(() => staff.supprimerGroupe(g.groupe.id, moi))}>Supprimer</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {edition?.groupe.atelier_id === a.atelier.id && (
            <FormulaireGroupe
              edition={edition}
              formateurs={formateurs}
              camp={camp}
              onChange={setEdition}
              onAnnuler={() => setEdition(undefined)}
              onEnregistrer={async () => {
                const liste = [
                  ...(edition.principal ? [{ utilisateur_id: edition.principal, role: 'principal' as const }] : []),
                  ...edition.secondaires.filter((s) => s !== edition.principal).map((utilisateur_id) => ({ utilisateur_id, role: 'secondaire' as const })),
                ]
                if (await agir(() => staff.enregistrerGroupe(edition.groupe, liste, moi))) setEdition(undefined)
              }}
            />
          )}
        </article>
      ))}

      {nouvelAtelier ? (
        <form className="bloc-gestion formulaire" onSubmit={async (e) => {
          e.preventDefault()
          const ok = await agir(() => staff.enregistrerAtelier({
            id: nouvelId(), camp_id: camp.id, technologie_id: nouvelAtelier.technologie_id,
            titre_fr: nouvelAtelier.titre_fr, titre_en: nouvelAtelier.titre_en || undefined,
          }, moi))
          if (ok) setNouvelAtelier(undefined)
        }}>
          <h2 className="titre-m">Nouvel atelier</h2>
          <div className="grille-champs">
            <label className="champ-groupe"><span>Technologie</span>
              <select className="champ" required value={nouvelAtelier.technologie_id} onChange={(e) => setNouvelAtelier({ ...nouvelAtelier, technologie_id: e.target.value })}>
                <option value="" disabled>Choisir…</option>
                {technos.map((t) => <option key={t.id} value={t.id}>{t.nom_fr}</option>)}
              </select>
            </label>
            <label className="champ-groupe"><span>Titre (français)</span>
              <input className="champ" required value={nouvelAtelier.titre_fr} onChange={(e) => setNouvelAtelier({ ...nouvelAtelier, titre_fr: e.target.value })} placeholder="Mon premier robot" />
            </label>
            <label className="champ-groupe"><span>Titre (anglais)</span>
              <input className="champ" value={nouvelAtelier.titre_en} onChange={(e) => setNouvelAtelier({ ...nouvelAtelier, titre_en: e.target.value })} placeholder="My first robot" />
            </label>
          </div>
          <div className="actions-formulaire">
            <button type="button" className="lien" onClick={() => setNouvelAtelier(undefined)}>Annuler</button>
            <button className="bouton bouton-principal">Créer l’atelier</button>
          </div>
        </form>
      ) : (
        <button type="button" className="bouton bouton-ajout" onClick={() => setNouvelAtelier({ technologie_id: '', titre_fr: '', titre_en: '' })}>+ Ajouter un atelier</button>
      )}
    </div>
  )
}

function FormulaireGroupe({ edition, formateurs, camp, onChange, onAnnuler, onEnregistrer }: {
  edition: GroupeEnEdition; formateurs: Utilisateur[]; camp: Camp
  onChange: (e: GroupeEnEdition) => void; onAnnuler: () => void; onEnregistrer: () => void
}) {
  const g = edition.groupe
  const maj = (patch: Partial<GroupeEnEdition['groupe']>) => onChange({ ...edition, groupe: { ...g, ...patch } })
  return (
    <form className="formulaire formulaire-groupe" onSubmit={(e) => { e.preventDefault(); onEnregistrer() }}>
      <h3 className="titre-m">{g.nom ? `Groupe ${g.nom}` : 'Nouveau groupe'}</h3>
      <div className="grille-champs grille-champs-4">
        <label className="champ-groupe"><span>Nom du groupe</span>
          <input className="champ" required value={g.nom} onChange={(e) => maj({ nom: e.target.value })} placeholder="Groupe C" />
        </label>
        <label className="champ-groupe"><span>Date</span>
          <input className="champ" type="date" required min={camp.date_debut} max={camp.date_fin} value={g.date} onChange={(e) => maj({ date: e.target.value })} />
        </label>
        <label className="champ-groupe"><span>Début</span>
          <input className="champ" type="time" required value={g.heure_debut} onChange={(e) => maj({ heure_debut: e.target.value })} />
        </label>
        <label className="champ-groupe"><span>Fin</span>
          <input className="champ" type="time" required value={g.heure_fin} onChange={(e) => maj({ heure_fin: e.target.value })} />
        </label>
        <label className="champ-groupe"><span>Salle</span>
          <input className="champ" value={g.salle ?? ''} onChange={(e) => maj({ salle: e.target.value })} placeholder="Salle 2" />
        </label>
        <label className="champ-groupe"><span>Formateur principal</span>
          <select className="champ" value={edition.principal} onChange={(e) => onChange({ ...edition, principal: e.target.value })}>
            <option value="">À désigner</option>
            {formateurs.map((f) => <option key={f.id} value={f.id}>{nomComplet(f)}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="cases">
        <legend>Formateurs secondaires</legend>
        {formateurs.filter((f) => f.id !== edition.principal).map((f) => (
          <label key={f.id} className="interrupteur">
            <input type="checkbox" checked={edition.secondaires.includes(f.id)} onChange={(e) => onChange({
              ...edition, secondaires: e.target.checked ? [...edition.secondaires, f.id] : edition.secondaires.filter((x) => x !== f.id),
            })} />
            {nomComplet(f)}
          </label>
        ))}
      </fieldset>
      <div className="actions-formulaire">
        <button type="button" className="lien" onClick={onAnnuler}>Annuler</button>
        <button className="bouton bouton-principal">Enregistrer le groupe</button>
      </div>
    </form>
  )
}
