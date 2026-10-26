import { useEffect, useState } from 'react'
import { readSheet } from 'read-excel-file/browser'
import writeXlsxFile, { type SheetData } from 'write-excel-file/browser'
import { staff } from '../../data'
import { ErreurDroits } from '../../data/staffRepository'
import { analyserFeuille, COLONNES, type LigneImport } from '../../lib/importEleves'
import type { AtelierDuCamp, Camp, Eleve } from '../../types'
import { useStaff } from '../contexteStaff'

type Etape = 'choix' | 'apercu' | 'termine'

const EXEMPLE: string[][] = [
  ['AMEGAH', 'Koffi', '02/03/2014', 'M', 'CM2', 'Lycée de Tokoin', 'Éwé', 'Mme Amegah', '+228 90 00 00 01', '+228 91 00 00 01', 'parent@exemple.tg', 'mère'],
]

export function OngletImport({ camp, onImporte }: { camp: Camp; onImporte: () => void }) {
  const { moi } = useStaff()
  const [etape, setEtape] = useState<Etape>('choix')
  const [structure, setStructure] = useState<AtelierDuCamp[]>([])
  const [fichier, setFichier] = useState<string>()
  const [lignes, setLignes] = useState<LigneImport[]>([])
  const [groupeIds, setGroupeIds] = useState<string[]>([])
  const [erreur, setErreur] = useState<string>()
  const [resultat, setResultat] = useState<{ crees: Eleve[]; rattaches: Eleve[] }>()
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => { staff.structureCamp(camp.id).then(setStructure) }, [camp.id])
  if (!moi) return null

  const groupes = structure.flatMap((a) => a.groupes.map((g) => ({ ...g, atelier: a.atelier })))
  const valides = lignes.filter((l) => l.erreurs.length === 0)
  const enErreur = lignes.filter((l) => l.erreurs.length > 0)
  const aRattacher = valides.filter((l) => l.eleve_existant_id)

  async function telechargerModele() {
    const feuille: SheetData = [
      [...COLONNES].map((c) => ({ value: c, fontWeight: 'bold' as const })),
      ...EXEMPLE.map((l) => l.map((v) => ({ value: v }))),
    ]
    await writeXlsxFile(feuille, { columns: COLONNES.map((c) => ({ width: Math.max(14, c.length + 4) })) })
      .toFile('modele-inscription-camp-caysti.xlsx')
  }

  async function lire(f: File) {
    setErreur(undefined)
    try {
      const donnees = await readSheet(f)
      const ref = {
        ecoles: await staff.ecoles(),
        langues: await staff.langues(),
        eleves: await staff.identitesEleves(),
        dateReference: new Date(`${camp.date_debut}T00:00:00Z`),
      }
      const analyse = analyserFeuille(donnees as Parameters<typeof analyserFeuille>[0], ref)
      if (analyse.colonnesManquantes.length) {
        setErreur(`Colonnes introuvables : ${analyse.colonnesManquantes.join(', ')}. Partez du modèle pour garder les bons en-têtes.`)
        return
      }
      if (analyse.lignes.length === 0) { setErreur('Le fichier ne contient aucun élève sous la ligne d’en-tête.'); return }
      setFichier(f.name); setLignes(analyse.lignes); setEtape('apercu')
    } catch {
      setErreur('Ce fichier n’a pas pu être lu. Enregistrez-le au format Excel (.xlsx) et réessayez.')
    }
  }

  async function importer() {
    if (!moi || !fichier) return
    setEnvoi(true); setErreur(undefined)
    try {
      setResultat(await staff.importerEleves(camp.id, lignes, groupeIds, fichier, moi))
      setEtape('termine')
    } catch (e) {
      setErreur(e instanceof ErreurDroits ? e.message : 'L’import a échoué. Aucun élève n’a été ajouté.')
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="onglet-contenu">
      {erreur && <p className="erreur" role="alert">{erreur}</p>}

      {etape === 'choix' && (
        <div className="bloc-gestion import-choix">
          <ol className="etapes-import">
            <li>
              <strong>Téléchargez le modèle</strong> et envoyez-le aux écoles, ou recopiez-y leurs listes.
              Une ligne par élève ; colonnes obligatoires : nom, prénom, date de naissance, sexe, classe, et au moins un contact du parent.
              <button type="button" className="bouton" onClick={telechargerModele}>Télécharger le modèle Excel</button>
            </li>
            <li>
              <strong>Choisissez le fichier rempli.</strong> Rien n’est enregistré avant votre confirmation : vous verrez d’abord chaque ligne, avec les erreurs à corriger.
              <label className="bouton bouton-principal bouton-fichier">
                Choisir le fichier Excel
                <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void lire(f) }} />
              </label>
            </li>
          </ol>
        </div>
      )}

      {etape === 'apercu' && (
        <>
          <dl className="chiffres">
            <div><dt>Lignes lues</dt><dd>{lignes.length}</dd></div>
            <div><dt>Nouveaux élèves</dt><dd>{valides.length - aRattacher.length}</dd></div>
            <div><dt>Déjà connus (rattachés)</dt><dd>{aRattacher.length}</dd></div>
            <div className={enErreur.length ? 'chiffre-alerte' : undefined}><dt>À corriger</dt><dd>{enErreur.length}</dd></div>
          </dl>
          {enErreur.length > 0 && (
            <p className="encart encart-alerte">
              Les {enErreur.length} ligne{enErreur.length > 1 ? 's' : ''} en erreur ne seront pas importée{enErreur.length > 1 ? 's' : ''}.
              Corrigez-les dans le fichier puis importez-le à nouveau : les élèves déjà importés seront reconnus et non dupliqués.
            </p>
          )}

          <div className="tableau-defilant">
            <table className="tableau tableau-import">
              <thead>
                <tr><th className="nombre">Ligne</th><th>Élève</th><th>Naissance</th><th>Sexe</th><th>Classe</th><th>École</th><th>Contact parent</th><th>État</th></tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.numero} className={l.erreurs.length ? 'ligne-erreur' : undefined}>
                    <td className="nombre">{l.numero}</td>
                    <td>{l.prenom} {l.nom}</td>
                    <td>{l.date_naissance ? new Date(`${l.date_naissance}T12:00:00`).toLocaleDateString('fr-FR') : '—'}</td>
                    <td>{l.sexe ?? '—'}</td>
                    <td>{l.classe ?? '—'}</td>
                    <td>{l.ecole_nom ?? '—'}{l.ecole_nom && !l.ecole_id && <span className="aide"> (nouvelle)</span>}</td>
                    <td className="contact">{l.tuteur.telephone ?? l.tuteur.whatsapp ?? l.tuteur.email ?? '—'}</td>
                    <td>
                      {l.erreurs.length
                        ? <ul className="problemes">{l.erreurs.map((m) => <li key={m}>{m}</li>)}</ul>
                        : l.eleve_existant_id ? 'Déjà connu : rattaché' : 'Prêt'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <fieldset className="cases bloc-gestion">
            <legend>Inscrire ces élèves aux groupes</legend>
            {groupes.map((g) => (
              <label key={g.groupe.id} className="interrupteur">
                <input type="checkbox" checked={groupeIds.includes(g.groupe.id)} onChange={(e) => setGroupeIds(e.target.checked ? [...groupeIds, g.groupe.id] : groupeIds.filter((x) => x !== g.groupe.id))} />
                {g.atelier.titre_fr}, {g.groupe.nom} ({g.groupe.heure_debut}–{g.groupe.heure_fin})
              </label>
            ))}
            {groupeIds.length === 0 && <p className="aide">Sans groupe coché, les élèves sont créés mais n’apparaissent dans aucun atelier.</p>}
          </fieldset>

          <div className="actions-formulaire">
            <button type="button" className="lien" onClick={() => { setEtape('choix'); setLignes([]) }}>Choisir un autre fichier</button>
            <button type="button" className="bouton bouton-principal" disabled={valides.length === 0 || envoi} onClick={importer}>
              Importer {valides.length} élève{valides.length > 1 ? 's' : ''}
            </button>
          </div>
        </>
      )}

      {etape === 'termine' && resultat && (
        <div className="bloc-gestion">
          <h2 className="titre-m">Import terminé</h2>
          <p>
            {resultat.crees.length} élève{resultat.crees.length > 1 ? 's' : ''} créé{resultat.crees.length > 1 ? 's' : ''}
            {resultat.rattaches.length > 0 && `, ${resultat.rattaches.length} élève${resultat.rattaches.length > 1 ? 's' : ''} déjà connu${resultat.rattaches.length > 1 ? 's' : ''} rattaché${resultat.rattaches.length > 1 ? 's' : ''} (même code qu’avant)`}.
          </p>
          {resultat.crees.length > 0 && (
            <div className="tableau-defilant">
              <table className="tableau">
                <thead><tr><th>Élève</th><th>Code personnel</th></tr></thead>
                <tbody>
                  {resultat.crees.map((e) => <tr key={e.id}><td>{e.prenom} {e.nom}</td><td className="code">{e.code_acces}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
          <div className="actions-formulaire">
            <button type="button" className="lien" onClick={() => { setEtape('choix'); setLignes([]); setResultat(undefined) }}>Importer un autre fichier</button>
            <button type="button" className="bouton bouton-principal" onClick={onImporte}>Voir la liste des élèves</button>
          </div>
        </div>
      )}
    </div>
  )
}
