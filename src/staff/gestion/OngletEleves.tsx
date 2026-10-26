import { useCallback, useEffect, useMemo, useState } from 'react'
import { staff } from '../../data'
import { ErreurDroits } from '../../data/staffRepository'
import { nouvelId } from '../../lib/ids'
import { normaliser } from '../../lib/importEleves'
import type { AtelierDuCamp, Camp, Classe, Ecole, Eleve, EleveDuCamp, LangueParlee, Tuteur } from '../../types'
import { useStaff } from '../contexteStaff'

const CLASSES: Classe[] = ['CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e', '2nde', '1ere', 'Tle']
const libelleClasse = (c: Classe) => (c === '1ere' ? '1re' : c)

interface Saisie {
  eleve: Omit<Eleve, 'code_acces'> & { code_acces?: string }
  tuteur: Omit<Tuteur, 'id'> & { id?: string }
  groupeIds: string[]
}

const age = (iso: string, au: string) => {
  const [a, m, j] = iso.split('-').map(Number)
  const [ra, rm, rj] = au.split('-').map(Number)
  return ra - a - (rm < m || (rm === m && rj < j) ? 1 : 0)
}

export function OngletEleves({ camp }: { camp: Camp }) {
  const { moi } = useStaff()
  const [eleves, setEleves] = useState<EleveDuCamp[]>()
  const [structure, setStructure] = useState<AtelierDuCamp[]>([])
  const [ecoles, setEcoles] = useState<Ecole[]>([])
  const [langues, setLangues] = useState<LangueParlee[]>([])
  const [recherche, setRecherche] = useState('')
  const [filtreGroupe, setFiltreGroupe] = useState('')
  const [saisie, setSaisie] = useState<Saisie>()
  const [erreur, setErreur] = useState<string>()
  const [message, setMessage] = useState<string>()

  const charger = useCallback(async () => {
    setEleves(await staff.elevesDuCamp(camp.id))
    setEcoles(await staff.ecoles())
  }, [camp.id])
  useEffect(() => {
    void charger()
    staff.structureCamp(camp.id).then(setStructure)
    staff.langues().then(setLangues)
  }, [charger, camp.id])

  const groupes = structure.flatMap((a) => a.groupes.map((g) => ({ ...g, atelier: a.atelier })))
  const visibles = useMemo(() => (eleves ?? []).filter((e) => {
    const r = normaliser(recherche)
    return (!r || normaliser(`${e.eleve.prenom} ${e.eleve.nom} ${e.eleve.code_acces} ${e.ecole?.nom ?? ''}`).includes(r))
      && (!filtreGroupe || e.groupes.some((g) => g.groupe.id === filtreGroupe))
  }), [eleves, recherche, filtreGroupe])

  if (!moi || !eleves) return <p className="aide">Chargement…</p>

  const ouvrir = (e?: EleveDuCamp) => {
    setErreur(undefined); setMessage(undefined)
    setSaisie(e
      ? { eleve: e.eleve, tuteur: e.tuteur ?? { nom: '' }, groupeIds: e.groupes.map((g) => g.groupe.id) }
      : {
          eleve: { id: nouvelId(), nom: '', prenom: '', date_naissance: '', sexe: 'F', classe: '6e', langue_interface: 'fr' },
          tuteur: { nom: '' }, groupeIds: [],
        })
  }

  const enregistrer = async () => {
    if (!saisie) return
    setErreur(undefined)
    try {
      const cree = await staff.enregistrerEleve(camp.id, { eleve: saisie.eleve, tuteur: saisie.tuteur, groupeIds: saisie.groupeIds }, moi)
      setMessage(`${cree.prenom} ${cree.nom} est enregistré·e. Code personnel : ${cree.code_acces}`)
      setSaisie(undefined)
      await charger()
    } catch (e) {
      setErreur(e instanceof ErreurDroits ? e.message : 'L’enregistrement a échoué.')
    }
  }

  return (
    <div className="onglet-contenu">
      <div className="filtres">
        <label className="sr-only" htmlFor="recherche-eleve">Rechercher un élève</label>
        <input id="recherche-eleve" className="champ" type="search" placeholder="Nom, code ou école…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <label className="sr-only" htmlFor="filtre-groupe">Groupe</label>
        <select id="filtre-groupe" className="champ champ-court" value={filtreGroupe} onChange={(e) => setFiltreGroupe(e.target.value)}>
          <option value="">Tous les groupes</option>
          {groupes.map((g) => <option key={g.groupe.id} value={g.groupe.id}>{g.atelier.titre_fr}, {g.groupe.nom}</option>)}
        </select>
        <button type="button" className="bouton bouton-principal" onClick={() => ouvrir()}>Inscrire un élève</button>
      </div>

      {message && <p className="message-ok" role="status">{message}</p>}
      {erreur && !saisie && <p className="erreur" role="alert">{erreur}</p>}

      {saisie && (
        <FormulaireEleve
          saisie={saisie}
          ecoles={ecoles}
          langues={langues}
          groupes={groupes}
          camp={camp}
          erreur={erreur}
          onChange={setSaisie}
          onAnnuler={() => setSaisie(undefined)}
          onEnregistrer={enregistrer}
        />
      )}

      <p className="aide">{visibles.length} élève{visibles.length > 1 ? 's' : ''}{visibles.length !== eleves.length ? ` sur ${eleves.length}` : ''}</p>
      <div className="tableau-defilant">
        <table className="tableau">
          <thead>
            <tr><th>Élève</th><th>Classe</th><th className="nombre">Âge</th><th>École</th><th>Ateliers</th><th>Code</th><th>Parent</th><th><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {visibles.map((e) => (
              <tr key={e.eleve.id}>
                <td>{e.eleve.prenom} {e.eleve.nom}</td>
                <td>{libelleClasse(e.eleve.classe)}</td>
                <td className="nombre">{age(e.eleve.date_naissance, camp.date_debut)}</td>
                <td>{e.ecole?.nom ?? '—'}</td>
                <td>{e.groupes.map((g) => <span key={g.groupe.id} className="puce-groupe">{g.atelier.titre_fr}, {g.groupe.nom}</span>)}</td>
                <td className="code">{e.eleve.code_acces}</td>
                <td className="contact">{e.tuteur?.telephone ?? e.tuteur?.whatsapp ?? e.tuteur?.email ?? '—'}</td>
                <td><button type="button" className="lien" onClick={() => ouvrir(e)}>Modifier</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FormulaireEleve({ saisie, ecoles, langues, groupes, camp, erreur, onChange, onAnnuler, onEnregistrer }: {
  saisie: Saisie; ecoles: Ecole[]; langues: LangueParlee[]
  groupes: (AtelierDuCamp['groupes'][number] & { atelier: AtelierDuCamp['atelier'] })[]
  camp: Camp; erreur?: string
  onChange: (s: Saisie) => void; onAnnuler: () => void; onEnregistrer: () => void
}) {
  const e = saisie.eleve
  const t = saisie.tuteur
  const majE = (patch: Partial<Saisie['eleve']>) => onChange({ ...saisie, eleve: { ...e, ...patch } })
  const majT = (patch: Partial<Saisie['tuteur']>) => onChange({ ...saisie, tuteur: { ...t, ...patch } })
  const autre = langues.find((l) => l.est_autre)

  return (
    <form className="formulaire bloc-gestion" onSubmit={(ev) => { ev.preventDefault(); onEnregistrer() }}>
      <h2 className="titre-m">{e.code_acces ? `${e.prenom} ${e.nom}` : 'Nouvel élève'}</h2>
      {e.code_acces && <p className="aide">Code personnel : <strong className="code">{e.code_acces}</strong> (il ne change jamais)</p>}
      {erreur && <p className="erreur" role="alert">{erreur}</p>}

      <h3 className="sous-titre">Élève</h3>
      <div className="grille-champs grille-champs-4">
        <label className="champ-groupe"><span>Nom</span><input className="champ" required value={e.nom} onChange={(x) => majE({ nom: x.target.value })} /></label>
        <label className="champ-groupe"><span>Prénom</span><input className="champ" required value={e.prenom} onChange={(x) => majE({ prenom: x.target.value })} /></label>
        <label className="champ-groupe"><span>Date de naissance</span><input className="champ" type="date" required value={e.date_naissance} max={camp.date_debut} onChange={(x) => majE({ date_naissance: x.target.value })} /></label>
        <label className="champ-groupe"><span>Sexe</span>
          <select className="champ" value={e.sexe} onChange={(x) => majE({ sexe: x.target.value as Eleve['sexe'] })}>
            <option value="F">Fille</option><option value="M">Garçon</option>
          </select>
        </label>
        <label className="champ-groupe"><span>Classe</span>
          <select className="champ" value={e.classe} onChange={(x) => majE({ classe: x.target.value as Classe })}>
            {CLASSES.map((c) => <option key={c} value={c}>{libelleClasse(c)}</option>)}
          </select>
        </label>
        <label className="champ-groupe"><span>École</span>
          <select className="champ" value={e.ecole_id ?? ''} onChange={(x) => majE({ ecole_id: x.target.value || undefined })}>
            <option value="">Non renseignée</option>
            {ecoles.map((ec) => <option key={ec.id} value={ec.id}>{ec.nom}</option>)}
          </select>
        </label>
        <label className="champ-groupe"><span>Langue parlée</span>
          <select className="champ" value={e.langue_id ?? ''} onChange={(x) => majE({ langue_id: x.target.value || undefined, langue_autre: undefined })}>
            <option value="">Non renseignée</option>
            {langues.map((l) => <option key={l.id} value={l.id}>{l.libelle_fr}</option>)}
          </select>
        </label>
        {autre && e.langue_id === autre.id && (
          <label className="champ-groupe"><span>Quelle langue ?</span><input className="champ" value={e.langue_autre ?? ''} onChange={(x) => majE({ langue_autre: x.target.value })} /></label>
        )}
        <label className="champ-groupe"><span>Langue de l’application</span>
          <select className="champ" value={e.langue_interface} onChange={(x) => majE({ langue_interface: x.target.value as Eleve['langue_interface'] })}>
            <option value="fr">Français</option><option value="en">Anglais</option>
          </select>
        </label>
      </div>

      <h3 className="sous-titre">Parent ou tuteur</h3>
      <div className="grille-champs grille-champs-4">
        <label className="champ-groupe"><span>Nom</span><input className="champ" value={t.nom ?? ''} onChange={(x) => majT({ nom: x.target.value })} /></label>
        <label className="champ-groupe"><span>Lien</span><input className="champ" value={t.lien ?? ''} onChange={(x) => majT({ lien: x.target.value })} placeholder="mère, père, tante…" /></label>
        <label className="champ-groupe"><span>Téléphone</span><input className="champ" type="tel" value={t.telephone ?? ''} onChange={(x) => majT({ telephone: x.target.value })} /></label>
        <label className="champ-groupe"><span>WhatsApp</span><input className="champ" type="tel" value={t.whatsapp ?? ''} onChange={(x) => majT({ whatsapp: x.target.value })} /></label>
        <label className="champ-groupe"><span>E-mail</span><input className="champ" type="email" value={t.email ?? ''} onChange={(x) => majT({ email: x.target.value })} /></label>
      </div>
      <label className="interrupteur">
        <input type="checkbox" checked={!!t.consentement_le} onChange={(x) => majT({
          consentement_le: x.target.checked ? new Date().toISOString() : undefined,
          consentement_mode: x.target.checked ? 'case cochée par l’admin' : undefined,
        })} />
        Le parent a donné son autorisation (participation et données de l’enfant)
      </label>

      <fieldset className="cases">
        <legend>Ateliers du camp</legend>
        {groupes.length === 0 && <p className="aide">Aucun groupe dans ce camp pour l’instant.</p>}
        {groupes.map((g) => (
          <label key={g.groupe.id} className="interrupteur">
            <input type="checkbox" checked={saisie.groupeIds.includes(g.groupe.id)} onChange={(x) => onChange({
              ...saisie, groupeIds: x.target.checked ? [...saisie.groupeIds, g.groupe.id] : saisie.groupeIds.filter((id) => id !== g.groupe.id),
            })} />
            {g.atelier.titre_fr}, {g.groupe.nom} ({g.groupe.heure_debut}–{g.groupe.heure_fin})
          </label>
        ))}
      </fieldset>

      <div className="actions-formulaire">
        <button type="button" className="lien" onClick={onAnnuler}>Annuler</button>
        <button className="bouton bouton-principal">{e.code_acces ? 'Enregistrer' : 'Inscrire et générer le code'}</button>
      </div>
    </form>
  )
}
