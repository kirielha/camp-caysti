import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { staff } from '../data'
import { ErreurDroits, type ResumeFiche } from '../data/staffRepository'
import { nomComplet, peutProgrammer } from '../lib/droits'
import type { ActiviteDuGroupe, DetailGroupe, StatutSession } from '../types'
import { BlocCode } from '../components/BlocCode'
import { telechargerCodes } from '../lib/exportsExcel'
import { useStaff } from './contexteStaff'
import { jourCourt, libelleStatutGroupe, libelleType } from './libelles'

const libelleStatutSession: Record<StatutSession, string> = { brouillon: 'Pas encore ouverte', ouverte: 'Ouverte', fermee: 'Fermée' }

export function PilotageGroupe() {
  const { groupeId = '' } = useParams()
  const { moi } = useStaff()
  const [d, setD] = useState<DetailGroupe>()
  const [fiches, setFiches] = useState<ResumeFiche[]>([])
  const [erreur, setErreur] = useState<string>()
  const [confirmer, setConfirmer] = useState<'demarrer' | 'terminer'>()

  const charger = useCallback(async () => {
    if (!moi) return
    setD(await staff.detailGroupe(groupeId, moi))
  }, [groupeId, moi])

  useEffect(() => {
    void charger()
    const id = setInterval(() => void charger(), 5000) // avancement des élèves en direct
    return () => clearInterval(id)
  }, [charger])

  useEffect(() => { if (moi) staff.fichesVisibles(moi).then(setFiches) }, [moi])

  if (!moi || !d) return <p className="aide">Chargement…</p>

  const agir = async (action: () => Promise<void>) => {
    setErreur(undefined)
    try { await action(); await charger() } catch (e) { setErreur(e instanceof ErreurDroits ? e.message : 'L’action a échoué. Réessayez.') }
  }

  const idsParties = new Set((d.parties ?? []).map((p) => p.partie.id))
  const autres = d.activites.filter((a) => !a.session.partie_id || !idsParties.has(a.session.partie_id))
  const deja = new Set(d.activites.map((a) => `${a.fiche.id}|${a.session.partie_id ?? ''}`))
  const programmables = fiches
    .filter((f) => peutProgrammer(f.fiche, moi) && f.nb_questions > 0)
    .sort((a, b) => Number(b.fiche.technologie_id === d.technologie.id) - Number(a.fiche.technologie_id === d.technologie.id))

  return (
    <section className="pilotage" style={{ ['--techno' as string]: d.technologie.couleur }}>
      <Link to="/formateur/groupes" className="lien">‹ Retour aux groupes</Link>

      <header className="pilotage-entete">
        <div>
          <p className="aide">{d.technologie.nom_fr}, {d.groupe.nom}{d.groupe.salle ? `, ${d.groupe.salle}` : ''}</p>
          <h1 className="titre-l">{d.atelier.titre_fr}</h1>
          <p className="pilotage-horaire">{jourCourt(d.groupe.date)}, {d.groupe.heure_debut}–{d.groupe.heure_fin}</p>
          <p className="aide">
            {d.formateurs.map((f) => `${nomComplet(f.utilisateur)} (${f.role})`).join(', ') || 'Aucun formateur affecté'}
          </p>
        </div>

        <div className={`statut-atelier statut-atelier-${d.groupe.statut}`}>
          <p className="statut-atelier-libelle">Atelier {libelleStatutGroupe[d.groupe.statut].toLowerCase()}</p>
          {d.groupe.statut !== 'en_cours' && (
            confirmer === 'demarrer' ? (
              <div className="confirmation">
                <span>Les élèves pourront commencer les activités ouvertes.</span>
                <button type="button" className="bouton bouton-principal" onClick={() => agir(() => staff.changerStatutGroupe(d.groupe.id, 'en_cours', moi)).then(() => setConfirmer(undefined))}>
                  Confirmer le démarrage
                </button>
                <button type="button" className="lien" onClick={() => setConfirmer(undefined)}>Annuler</button>
              </div>
            ) : (
              <button type="button" className="bouton bouton-principal" onClick={() => setConfirmer('demarrer')}>
                {d.groupe.statut === 'termine' ? 'Rouvrir l’atelier' : 'Démarrer l’atelier'}
              </button>
            )
          )}
          {d.groupe.statut === 'en_cours' && (
            confirmer === 'terminer' ? (
              <div className="confirmation">
                <span>Plus aucune activité ne pourra démarrer.</span>
                <button type="button" className="bouton" onClick={() => agir(() => staff.changerStatutGroupe(d.groupe.id, 'termine', moi)).then(() => setConfirmer(undefined))}>
                  Confirmer la fin
                </button>
                <button type="button" className="lien" onClick={() => setConfirmer(undefined)}>Annuler</button>
              </div>
            ) : (
              <button type="button" className="bouton" onClick={() => setConfirmer('terminer')}>Terminer l’atelier</button>
            )
          )}
        </div>
      </header>

      {erreur && <p className="erreur" role="alert">{erreur}</p>}

      <h2 className="titre-m">Activités</h2>
      {d.activites.length === 0 && <p className="vide">Aucune activité programmée. Ajoutez une fiche ci-dessous.</p>}
      {(d.parties ?? []).map((p, i) => {
        const liste = d.activites.filter((a) => a.session.partie_id === p.partie.id)
        return (
          <section key={p.partie.id} className="partie-staff">
            <h3 className="titre-partie-staff">Partie {i + 1} : {p.partie.titre_fr}</h3>
            {liste.length === 0 && <p className="aide">Aucune fiche pour cette partie.</p>}
            <ul className="liste-activites-staff">
              {liste.map((a) => (
                <LigneActivite key={a.session.id} a={a} nbEleves={d.nb_eleves} atelierEnCours={d.groupe.statut === 'en_cours'} agir={agir} />
              ))}
            </ul>
            {p.ressources.length > 0 && (
              <details className="ressources">
                <summary>Code à copier, vu par les élèves ({p.ressources.length})</summary>
                {p.ressources.map((r) => <BlocCode key={r.id} r={r} libelles={{ copier: 'Copier', copie: 'Copié !', copieImpossible: 'Sélectionnez le texte et copiez-le' }} />)}
              </details>
            )}
          </section>
        )
      })}
      {autres.length > 0 && (
        <>
          {(d.parties ?? []).length > 0 && <h3 className="titre-partie-staff">Autres activités</h3>}
          <ul className="liste-activites-staff">
            {autres.map((a) => (
              <LigneActivite key={a.session.id} a={a} nbEleves={d.nb_eleves} atelierEnCours={d.groupe.statut === 'en_cours'} agir={agir} />
            ))}
          </ul>
        </>
      )}

      <form
        className="programmer"
        onSubmit={(e) => {
          e.preventDefault()
          const donnees = new FormData(e.currentTarget)
          const ficheId = donnees.get('fiche') as string
          const partieId = (donnees.get('partie') as string) || undefined
          if (!ficheId) return
          if (deja.has(`${ficheId}|${partieId ?? ''}`)) { setErreur('Cette fiche est déjà programmée dans cette partie.'); return }
          void agir(() => staff.ajouterActivite(d.groupe.id, ficheId, moi, partieId))
          e.currentTarget.reset()
        }}
      >
        <label htmlFor="fiche-a-programmer">Programmer une fiche dans ce groupe</label>
        <div className="programmer-ligne">
          <select id="fiche-a-programmer" name="fiche" defaultValue="">
            <option value="" disabled>Choisir une fiche…</option>
            {programmables.map((f) => (
              <option key={f.fiche.id} value={f.fiche.id}>
                {libelleType[f.fiche.type]} : {f.fiche.titre_fr}{f.fiche.statut_validation !== 'validee' ? ' (votre brouillon)' : ''}
              </option>
            ))}
          </select>
          {(d.parties ?? []).length > 0 && (
            <select name="partie" defaultValue={d.parties?.[0]?.partie.id} aria-label="Partie">
              {d.parties?.map((p, i) => <option key={p.partie.id} value={p.partie.id}>Partie {i + 1} : {p.partie.titre_fr}</option>)}
              <option value="">Hors partie</option>
            </select>
          )}
          <button className="bouton">Ajouter</button>
        </div>
        <p className="aide">L’activité est ajoutée fermée : ouvrez-la au moment voulu. <Link className="lien" to="/formateur/fiches">Créer une fiche</Link></p>
      </form>

      <details className="eleves-groupe">
        <summary>Élèves inscrits ({d.eleves.length})</summary>
        {d.eleves.length > 0 && (
          <button type="button" className="lien" onClick={() => void telechargerCodes(d.eleves, d.atelier.titre_fr, d.groupe.nom, d.groupe.date)}>
            Télécharger la liste des codes (Excel)
          </button>
        )}
        <table className="tableau">
          <thead><tr><th>Élève</th><th>Classe</th><th>Code</th></tr></thead>
          <tbody>
            {d.eleves.map((e) => (
              <tr key={e.id}><td>{e.prenom} {e.nom}</td><td>{e.classe}</td><td className="code">{e.code_acces}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}

function LigneActivite({ a, nbEleves, atelierEnCours, agir }: {
  a: ActiviteDuGroupe; nbEleves: number; atelierEnCours: boolean; agir: (f: () => Promise<void>) => Promise<void>
}) {
  const { moi } = useStaff()
  if (!moi) return null
  const s = a.session
  const pct = nbEleves ? Math.round((a.nb_soumises / nbEleves) * 100) : 0

  return (
    <li className="activite-staff">
      <div className="activite-staff-texte">
        <p className="activite-meta">
          <span className={`etiquette-type etiquette-${a.fiche.type}`}>{libelleType[a.fiche.type]}</span>
          <span className={`etat-session etat-session-${s.statut}`}>{libelleStatutSession[s.statut]}</span>
          {s.mode === 'pilote' && <span className="etiquette-direct">En direct</span>}
        </p>
        <h3>{a.fiche.titre_fr}</h3>
        <p className="aide">{a.nb_questions} questions</p>
        <div className="avancement" aria-label={`${a.nb_soumises} élèves sur ${nbEleves} ont terminé`}>
          <div className="avancement-barre"><div style={{ width: `${pct}%` }} /></div>
          <span>{a.nb_soumises}/{nbEleves} ont terminé{a.nb_en_cours > 0 ? `, ${a.nb_en_cours} en cours` : ''}</span>
        </div>
      </div>
      <div className="activite-staff-actions">
        {a.fiche.type !== 'satisfaction' && a.nb_soumises + a.nb_en_cours === 0 && s.statut !== 'fermee' && (
          <label className="mode-session">
            <span>Déroulement</span>
            <select className="champ" value={s.mode} onChange={(e) => agir(() => staff.changerModeSession(s.id, e.target.value as 'libre' | 'pilote', moi))}>
              <option value="libre">Chacun à son rythme</option>
              <option value="pilote">Piloté en direct (type Kahoot)</option>
            </select>
          </label>
        )}
        {s.mode === 'pilote' && s.etape !== 'terminee' && (
          <Link className="bouton bouton-principal" to={`/formateur/direct/${s.id}`}>Animer en direct</Link>
        )}
        {s.statut !== 'ouverte' ? (
          <button type="button" className="bouton bouton-principal" onClick={() => agir(() => staff.changerStatutSession(s.id, 'ouverte', moi))}>
            {s.statut === 'fermee' ? 'Rouvrir' : 'Ouvrir'}
          </button>
        ) : (
          <button type="button" className="bouton" onClick={() => agir(() => staff.changerStatutSession(s.id, 'fermee', moi))}>Fermer</button>
        )}
        {s.statut === 'ouverte' && !atelierEnCours && <span className="aide">Visible des élèves au démarrage de l’atelier</span>}
        <Link className="lien" to={`/formateur/session/${s.id}`}>Résultats</Link>
        {a.fiche.type !== 'satisfaction' && (
          <label className="interrupteur">
            <input type="checkbox" checked={s.classement_affiche} onChange={(e) => agir(() => staff.changerAffichageClassement(s.id, e.target.checked, moi))} />
            Classement visible des élèves
          </label>
        )}
        {a.nb_soumises + a.nb_en_cours === 0 && (
          <button type="button" className="lien lien-danger" onClick={() => agir(() => staff.retirerActivite(s.id, moi))}>Retirer</button>
        )}
      </div>
    </li>
  )
}
