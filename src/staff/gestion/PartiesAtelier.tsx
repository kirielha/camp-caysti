import { useState } from 'react'
import { staff } from '../../data'
import { ErreurDroits, type ResumeFiche, type SaisiePartie } from '../../data/staffRepository'
import type { AtelierDuCamp, Personnel, TypeFiche } from '../../types'

const CASES: [TypeFiche, 'fiche_pretest_id' | 'fiche_quiz_id' | 'fiche_posttest_id', string][] = [
  ['pretest', 'fiche_pretest_id', 'Prétest'],
  ['quiz', 'fiche_quiz_id', 'Quiz / évaluation interne'],
  ['posttest', 'fiche_posttest_id', 'Post-test'],
]

/**
 * Parties d'un atelier (ex. IoT puis Programmation) : leurs fiches et le code à copier.
 * Les fiches choisies deviennent automatiquement des activités (fermées) de chaque groupe de l'atelier.
 */
export function PartiesAtelier({ a, fiches, moi, onChange }: {
  a: AtelierDuCamp; fiches: ResumeFiche[]; moi: Personnel; onChange: () => Promise<unknown>
}) {
  const [edition, setEdition] = useState<SaisiePartie>()
  const [erreur, setErreur] = useState<string>()
  const parties = a.parties ?? []
  const titreFiche = (id?: string) => (id ? fiches.find((f) => f.fiche.id === id)?.fiche.titre_fr ?? 'fiche' : undefined)

  const agir = async (f: () => Promise<unknown>) => {
    setErreur(undefined)
    try { await f(); await onChange(); return true } catch (e) {
      setErreur(e instanceof ErreurDroits ? e.message : 'L’enregistrement a échoué.')
      return false
    }
  }

  const nouvelle = (): SaisiePartie => ({
    partie: { atelier_id: a.atelier.id, ordre: (parties.at(-1)?.partie.ordre ?? 0) + 1, titre_fr: '', titre_en: '' },
    ressources: [],
  })

  return (
    <div className="parties-atelier">
      <p className="sous-titre-gestion">Parties de l’atelier</p>
      {parties.length === 0 && !edition && (
        <p className="aide">Aucune partie. Découpez l’atelier (ex. « IoT », puis « Programmation ») : chaque partie a son prétest, son quiz et son post-test.</p>
      )}
      <ul className="parties-gestion">
        {parties.map(({ partie: p, ressources }) => edition?.partie.id === p.id ? null : (
          <li key={p.id} className="partie-gestion">
            <div>
              <p><strong>{p.ordre}. {p.titre_fr}</strong></p>
              <p className="aide">
                {CASES.map(([, champ, libelle]) => `${libelle} : ${titreFiche(p[champ]) ?? '—'}`).join(' · ')}
              </p>
              <p className="aide">{ressources.length ? `${ressources.length} code(s) à copier` : 'Aucun code à copier'}</p>
            </div>
            <div className="groupe-gestion-actions">
              <button type="button" className="lien" onClick={() => setEdition({
                partie: { ...p, titre_en: p.titre_en ?? '' },
                ressources: ressources.map((r) => ({ titre: r.titre, langage: r.langage ?? '', contenu: r.contenu })),
              })}>Modifier</button>
              <button type="button" className="lien lien-danger" onClick={() => {
                if (window.confirm(`Supprimer la partie « ${p.titre_fr} » ? Ses activités pas encore commencées seront retirées des groupes.`)) {
                  void agir(() => staff.supprimerPartie(p.id, moi))
                }
              }}>Supprimer</button>
            </div>
          </li>
        ))}
      </ul>
      {erreur && <p className="erreur" role="alert">{erreur}</p>}

      {edition ? (
        <FormulairePartie
          edition={edition} fiches={fiches} onChange={setEdition} onAnnuler={() => setEdition(undefined)}
          onEnregistrer={async () => { if (await agir(() => staff.enregistrerPartie(edition, moi))) setEdition(undefined) }}
        />
      ) : (
        <button type="button" className="lien" onClick={() => setEdition(nouvelle())}>+ Ajouter une partie</button>
      )}
    </div>
  )
}

function FormulairePartie({ edition, fiches, onChange, onAnnuler, onEnregistrer }: {
  edition: SaisiePartie; fiches: ResumeFiche[]
  onChange: (e: SaisiePartie) => void; onAnnuler: () => void; onEnregistrer: () => void
}) {
  const p = edition.partie
  const maj = (patch: Partial<SaisiePartie['partie']>) => onChange({ ...edition, partie: { ...p, ...patch } })
  const majRessource = (i: number, patch: Partial<SaisiePartie['ressources'][number]>) =>
    onChange({ ...edition, ressources: edition.ressources.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  const validees = (type: TypeFiche) => fiches.filter((f) => f.fiche.type === type && f.fiche.statut_validation === 'validee')
  const id = p.id ?? 'nouvelle'

  return (
    <form className="formulaire formulaire-groupe" onSubmit={(e) => { e.preventDefault(); onEnregistrer() }}>
      <h3 className="titre-m">{p.id ? `Partie « ${p.titre_fr} »` : 'Nouvelle partie'}</h3>
      <div className="grille-champs grille-champs-4">
        <label className="champ-groupe"><span>N°</span>
          <input className="champ" type="number" min={1} required value={p.ordre} onChange={(e) => maj({ ordre: Number(e.target.value) || 1 })} />
        </label>
        <label className="champ-groupe"><span>Titre (français)</span>
          <input className="champ" required value={p.titre_fr} onChange={(e) => maj({ titre_fr: e.target.value })} placeholder="IoT" />
        </label>
        <label className="champ-groupe"><span>Titre (anglais)</span>
          <input className="champ" value={p.titre_en ?? ''} onChange={(e) => maj({ titre_en: e.target.value })} placeholder="IoT" />
        </label>
      </div>
      <div className="grille-champs">
        {CASES.map(([type, champ, libelle]) => (
          <label key={champ} className="champ-groupe"><span>{libelle}</span>
            <select className="champ" value={p[champ] ?? ''} onChange={(e) => maj({ [champ]: e.target.value || undefined })}>
              <option value="">Aucune</option>
              {validees(type).map((f) => <option key={f.fiche.id} value={f.fiche.id}>{f.fiche.titre_fr} ({f.nb_questions} q.)</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="aide">Seules les fiches validées sont proposées. Elles s’ajoutent, fermées, à chaque groupe de l’atelier : le coach les ouvre au bon moment.</p>

      <p className="sous-titre-gestion">Code à copier</p>
      {edition.ressources.map((r, i) => (
        <div key={i} className="ressource-edition">
          <div className="grille-champs">
            <label className="champ-groupe"><span>Titre</span>
              <input id={`${id}-r${i}-titre`} className="champ" value={r.titre} onChange={(e) => majRessource(i, { titre: e.target.value })} placeholder="Allumer la LED" />
            </label>
            <label className="champ-groupe"><span>Langage</span>
              <input id={`${id}-r${i}-langage`} className="champ" value={r.langage ?? ''} onChange={(e) => majRessource(i, { langage: e.target.value })} placeholder="Arduino" />
            </label>
          </div>
          <label className="champ-groupe"><span>Code</span>
            <textarea id={`${id}-r${i}-code`} className="champ" spellCheck={false} value={r.contenu} onChange={(e) => majRessource(i, { contenu: e.target.value })} />
          </label>
          <button type="button" className="lien lien-danger" onClick={() => onChange({ ...edition, ressources: edition.ressources.filter((_, j) => j !== i) })}>Retirer ce code</button>
        </div>
      ))}
      <button type="button" className="lien" onClick={() => onChange({ ...edition, ressources: [...edition.ressources, { titre: '', langage: '', contenu: '' }] })}>+ Ajouter un code</button>
      <p className="aide">Les élèves voient ce code et le copient en un geste dès que l’atelier a démarré.</p>

      <div className="actions-formulaire">
        <button type="button" className="lien" onClick={onAnnuler}>Annuler</button>
        <button className="bouton bouton-principal">Enregistrer la partie</button>
      </div>
    </form>
  )
}
