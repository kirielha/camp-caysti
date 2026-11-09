import { useEffect, useState } from 'react'
import { staff } from '../../data'
import { ErreurDroits } from '../../data/staffRepository'
import { analyserResultats, telechargerResultats } from '../../lib/exportsExcel'
import type { Camp, LigneExport } from '../../types'
import { useStaff } from '../contexteStaff'

const f = (v?: number, suffixe = ' %') => (v === undefined ? '—' : `${v.toLocaleString('fr-FR')}${suffixe}`)

/** Progression par atelier et par partie, et téléchargement Excel de tous les résultats du camp. */
export function OngletResultats({ camp }: { camp: Camp }) {
  const { moi } = useStaff()
  const [lignes, setLignes] = useState<LigneExport[]>()
  const [erreur, setErreur] = useState<string>()

  useEffect(() => {
    if (!moi) return
    staff.exportResultats(camp.id, moi).then(setLignes, (e) => setErreur(e instanceof ErreurDroits ? e.message : 'Chargement impossible.'))
  }, [camp.id, moi])

  if (erreur) return <p className="erreur" role="alert">{erreur}</p>
  if (!lignes) return <p className="aide">Chargement…</p>
  const { synthese } = analyserResultats(lignes)

  return (
    <div className="onglet-contenu">
      <div className="titre-avec-action">
        <p className="aide">Scores en pourcentage. La progression compare prétest et post-test des élèves qui ont passé les deux.</p>
        <button type="button" className="bouton bouton-principal" disabled={lignes.length === 0} onClick={() => void telechargerResultats(lignes, camp.nom)}>
          Télécharger le fichier Excel
        </button>
      </div>
      {synthese.length === 0 ? (
        <p className="vide">Aucun résultat pour l’instant : il faut des élèves inscrits et des activités programmées.</p>
      ) : (
        <div className="tableau-defilant">
          <table className="tableau synthese-export">
            <thead>
              <tr><th>Atelier</th><th>Partie</th><th className="nombre">Élèves</th><th className="nombre">Pré + post</th>
                <th className="nombre">Prétest</th><th className="nombre">Quiz</th><th className="nombre">Post-test</th><th className="nombre">Progression</th></tr>
            </thead>
            <tbody>
              {synthese.map((s) => (
                <tr key={`${s.atelier}|${s.partie}`}>
                  <td>{s.atelier}</td><td>{s.partie}</td><td className="nombre">{s.inscrits}</td><td className="nombre">{s.pre_et_post}</td>
                  <td className="nombre">{f(s.moyenne_pre)}</td><td className="nombre">{f(s.moyenne_quiz)}</td><td className="nombre">{f(s.moyenne_post)}</td>
                  <td className="nombre"><strong>{s.progression_moyenne === undefined ? '—' : `${s.progression_moyenne > 0 ? '+' : ''}${f(s.progression_moyenne, ' pts')}`}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
