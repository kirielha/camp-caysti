import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { staff } from '../data'
import { ErreurDroits, type SaisieCamp } from '../data/staffRepository'
import { estAdmin, estSuperAdmin } from '../lib/droits'
import type { Camp } from '../types'
import { useStaff } from './contexteStaff'
import { OngletAteliers } from './gestion/OngletAteliers'
import { OngletEleves } from './gestion/OngletEleves'
import { OngletImport } from './gestion/OngletImport'
import { OngletResultats } from './gestion/OngletResultats'

type Onglet = 'ateliers' | 'eleves' | 'import' | 'resultats'

/** Pays proposés à la création d'un camp (code ISO, nom). */
const PAYS: [string, string][] = [
  ['TG', 'Togo'], ['CM', 'Cameroun'], ['BJ', 'Bénin'], ['BF', 'Burkina Faso'], ['CI', 'Côte d’Ivoire'], ['SN', 'Sénégal'],
  ['ML', 'Mali'], ['NE', 'Niger'], ['GA', 'Gabon'], ['CG', 'Congo'], ['CD', 'RD Congo'], ['GN', 'Guinée'], ['TD', 'Tchad'],
  ['CF', 'Centrafrique'], ['MG', 'Madagascar'], ['RW', 'Rwanda'], ['BI', 'Burundi'], ['GH', 'Ghana'], ['NG', 'Nigeria'], ['FR', 'France'],
]

const dateFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR')

export function GestionCamp() {
  const { moi } = useStaff()
  const [camps, setCamps] = useState<Camp[]>()
  const [campId, setCampId] = useState<string>()
  const [onglet, setOnglet] = useState<Onglet>('ateliers')
  const [version, setVersion] = useState(0) // relit les onglets après un import
  const [edition, setEdition] = useState<SaisieCamp>()
  const [erreur, setErreur] = useState<string>()

  const chargerCamps = useCallback(async (selection?: string) => {
    const c = await staff.camps()
    setCamps(c)
    setCampId((id) => selection ?? id ?? c[0]?.id)
  }, [])
  useEffect(() => { void chargerCamps() }, [chargerCamps])
  const rafraichir = useCallback(() => setVersion((v) => v + 1), [])

  if (!moi) return null
  if (!estAdmin(moi)) return <Navigate to="/formateur/groupes" replace />
  const camp = camps?.find((c) => c.id === campId)
  const superAdmin = estSuperAdmin(moi)

  const nouveau = (): SaisieCamp => ({ nom: '', pays_code: 'TG', pays_nom: 'Togo', ville: '', date_debut: '', date_fin: '', lieu: '', statut: 'preparation' })
  const modifier = (c: Camp): SaisieCamp => ({
    id: c.id, nom: c.nom, pays_code: c.pays_code ?? 'TG', pays_nom: c.pays ?? 'Togo', ville: c.ville ?? '',
    date_debut: c.date_debut, date_fin: c.date_fin, lieu: c.lieu ?? '', statut: c.statut,
  })

  return (
    <section>
      <div className="titre-avec-action">
        <h1 className="titre-l">{camp?.nom ?? 'Camps'}</h1>
        <div className="actions-formulaire">
          {camps && camps.length > 1 && (
            <select className="champ champ-court" value={campId} onChange={(e) => setCampId(e.target.value)} aria-label="Camp">
              {camps.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          )}
          {camp && <button type="button" className="lien" onClick={() => setEdition(modifier(camp))}>Modifier le camp</button>}
          {superAdmin && <button type="button" className="bouton" onClick={() => setEdition(nouveau())}>Nouveau camp</button>}
        </div>
      </div>
      {camp && (
        <p className="aide">
          Du {dateFr(camp.date_debut)} au {dateFr(camp.date_fin)}{[camp.ville, camp.pays].filter(Boolean).length ? `, ${[camp.lieu, camp.ville, camp.pays].filter(Boolean).join(', ')}` : camp.lieu ? `, ${camp.lieu}` : ''}
        </p>
      )}

      {edition && (
        <form className="formulaire bloc-gestion" onSubmit={async (e) => {
          e.preventDefault()
          setErreur(undefined)
          try {
            const id = await staff.enregistrerCamp(edition, moi)
            setEdition(undefined)
            await chargerCamps(id)
          } catch (err) { setErreur(err instanceof ErreurDroits ? err.message : 'Enregistrement impossible.') }
        }}>
          <h2 className="titre-m">{edition.id ? 'Modifier le camp' : 'Nouveau camp'}</h2>
          <div className="grille-champs grille-champs-4">
            <label className="champ-groupe champ-large"><span>Nom du camp</span>
              <input id="camp-nom" className="champ" required value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} placeholder="Camp CAYSTI Lomé, décembre 2026" />
            </label>
            <label className="champ-groupe"><span>Pays</span>
              <select id="camp-pays" className="champ" value={edition.pays_code} onChange={(e) => setEdition({ ...edition, pays_code: e.target.value, pays_nom: PAYS.find((p) => p[0] === e.target.value)?.[1] ?? e.target.value })}>
                {PAYS.map(([code, nom]) => <option key={code} value={code}>{nom}</option>)}
              </select>
            </label>
            <label className="champ-groupe"><span>Ville</span>
              <input id="camp-ville" className="champ" required value={edition.ville} onChange={(e) => setEdition({ ...edition, ville: e.target.value })} />
            </label>
            <label className="champ-groupe"><span>Début</span>
              <input id="camp-debut" className="champ" type="date" required value={edition.date_debut} onChange={(e) => setEdition({ ...edition, date_debut: e.target.value })} />
            </label>
            <label className="champ-groupe"><span>Fin</span>
              <input id="camp-fin" className="champ" type="date" required min={edition.date_debut} value={edition.date_fin} onChange={(e) => setEdition({ ...edition, date_fin: e.target.value })} />
            </label>
            <label className="champ-groupe"><span>Lieu</span>
              <input id="camp-lieu" className="champ" value={edition.lieu ?? ''} onChange={(e) => setEdition({ ...edition, lieu: e.target.value })} placeholder="Établissement, quartier…" />
            </label>
            <label className="champ-groupe"><span>État</span>
              <select id="camp-statut" className="champ" value={edition.statut} onChange={(e) => setEdition({ ...edition, statut: e.target.value as Camp['statut'] })}>
                <option value="preparation">En préparation</option>
                <option value="en_cours">En cours</option>
                <option value="termine">Terminé (les élèves ne le voient plus)</option>
              </select>
            </label>
          </div>
          {erreur && <p className="erreur" role="alert">{erreur}</p>}
          <div className="actions-formulaire">
            <button type="button" className="lien" onClick={() => setEdition(undefined)}>Annuler</button>
            <button className="bouton bouton-principal">{edition.id ? 'Enregistrer' : 'Créer le camp'}</button>
          </div>
        </form>
      )}

      {camps?.length === 0 && !edition && (
        <p className="vide">{superAdmin ? 'Aucun camp pour l’instant. Créez le premier avec « Nouveau camp ».' : 'Aucun camp ne vous est confié pour l’instant.'}</p>
      )}

      {camp && (
        <>
          <div className="onglets" role="tablist">
            {([['ateliers', 'Ateliers et groupes'], ['eleves', 'Élèves'], ['import', 'Importer un fichier Excel'], ['resultats', 'Résultats']] as [Onglet, string][]).map(([id, libelle]) => (
              <button key={id} type="button" role="tab" aria-selected={onglet === id} onClick={() => setOnglet(id)}>{libelle}</button>
            ))}
          </div>
          {onglet === 'ateliers' && <OngletAteliers key={`a${version}${camp.id}`} camp={camp} />}
          {onglet === 'eleves' && <OngletEleves key={`e${version}${camp.id}`} camp={camp} />}
          {onglet === 'resultats' && <OngletResultats key={`r${version}${camp.id}`} camp={camp} />}
          {onglet === 'import' && <OngletImport key={camp.id} camp={camp} onImporte={() => { rafraichir(); setOnglet('eleves') }} />}
        </>
      )}
    </section>
  )
}
