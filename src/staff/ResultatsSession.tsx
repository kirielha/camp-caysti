import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { repo, staff } from '../data'
import type { LigneClassement, LigneResultat, SessionPourEleve } from '../types'
import { libelleType } from './PilotageGroupe'

const duree = (ms?: number) => {
  if (ms === undefined) return '—'
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`
}
const nombre = (n?: number) => (n ?? 0).toLocaleString('fr-FR')

export function ResultatsSession() {
  const { sessionId = '' } = useParams()
  const [detail, setDetail] = useState<SessionPourEleve>()
  const [lignes, setLignes] = useState<LigneResultat[]>()
  const [top, setTop] = useState<LigneClassement[]>([])
  const [projection, setProjection] = useState(false)

  const charger = useCallback(async () => {
    const [d, l, c] = await Promise.all([repo.chargerSession(sessionId), staff.resultatsSession(sessionId), repo.classement(sessionId, 10)])
    setDetail(d.detail); setLignes(l); setTop(c)
  }, [sessionId])

  useEffect(() => {
    void charger()
    const id = setInterval(() => void charger(), 4000)
    return () => clearInterval(id)
  }, [charger])

  if (!detail || !lignes) return <p className="aide">Chargement…</p>

  const terminees = lignes.filter((l) => l.tentative && l.tentative.statut !== 'en_cours')
  const moyenne = terminees.length ? terminees.reduce((s, l) => s + (l.tentative?.score ?? 0), 0) / terminees.length : 0
  const max = terminees[0]?.tentative?.score_max ?? 0

  if (projection) {
    return (
      <section className="projection">
        <button type="button" className="lien" onClick={() => setProjection(false)}>Quitter la projection</button>
        <p className="projection-contexte">{libelleType[detail.fiche.type]} : {detail.fiche.titre_fr}</p>
        <h1 className="titre-xl">Les 10 premiers</h1>
        <ol className="classement-liste projection-liste">
          {top.map((l) => (
            <li key={l.eleve_id} className={`classement-ligne${l.rang <= 3 ? ` podium-${l.rang}` : ''}`}>
              <span className="classement-rang">{l.rang}</span>
              <span className="classement-nom">{l.nom_affiche}</span>
              <span className="classement-score">{nombre(l.score)} pts</span>
              <span className="classement-temps">{duree(l.temps_total_ms)}</span>
            </li>
          ))}
        </ol>
        <p className="aide">À égalité de points, le plus rapide passe devant. Mise à jour automatique.</p>
      </section>
    )
  }

  return (
    <section>
      <Link to={`/formateur/groupe/${detail.groupe.id}`} className="lien">‹ Retour au groupe</Link>
      <p className="activite-meta" style={{ marginTop: 12 }}>
        <span className={`etiquette-type etiquette-${detail.fiche.type}`}>{libelleType[detail.fiche.type]}</span>
        <span>{detail.atelier.titre_fr}, {detail.groupe.nom}</span>
      </p>
      <h1 className="titre-l">{detail.fiche.titre_fr}</h1>

      <dl className="chiffres">
        <div><dt>Ont terminé</dt><dd>{terminees.length}/{lignes.length}</dd></div>
        <div><dt>En cours</dt><dd>{lignes.filter((l) => l.tentative?.statut === 'en_cours').length}</dd></div>
        {detail.fiche.type !== 'satisfaction' && <div><dt>Score moyen</dt><dd>{moyenne.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/{nombre(max)}</dd></div>}
      </dl>

      {detail.fiche.type !== 'satisfaction' && (
        <button type="button" className="bouton" onClick={() => setProjection(true)}>Projeter le classement</button>
      )}

      <div className="tableau-defilant">
        <table className="tableau">
          <thead>
            <tr><th>Élève</th><th>État</th><th className="nombre">Score</th><th className="nombre">Temps</th><th>À corriger</th></tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.eleve.id}>
                <td>{l.eleve.prenom} {l.eleve.nom}</td>
                <td>
                  {!l.tentative ? <span className="aide">Pas commencé</span>
                    : l.tentative.statut === 'en_cours' ? <span className="etat-session etat-session-ouverte">En cours</span>
                    : l.tentative.statut === 'expiree' ? 'Clos à la fermeture' : 'Terminé'}
                </td>
                <td className="nombre">{l.tentative && l.tentative.statut !== 'en_cours' ? `${nombre(l.tentative.score)}/${nombre(l.tentative.score_max)}` : '—'}</td>
                <td className="nombre">{l.tentative && l.tentative.statut !== 'en_cours' ? duree(l.tentative.temps_total_ms) : '—'}</td>
                <td>{l.en_attente > 0 ? `${l.en_attente} réponse${l.en_attente > 1 ? 's' : ''} écrite${l.en_attente > 1 ? 's' : ''}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="aide">Mise à jour automatique toutes les 4 secondes. Les réponses écrites seront corrigées par l’IA (lot 5).</p>
    </section>
  )
}
