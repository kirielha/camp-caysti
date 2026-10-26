// Classement d'une session — même règle que la vue SQL classement_session :
// score décroissant, puis temps total croissant (le plus rapide passe devant).
// La vitesse ne rapporte aucun point : elle ne sert qu'à départager.

import type { Eleve, LigneClassement, Tentative } from '../types'

/** « Prénom + initiale du nom » : Koffi Amegah → Koffi A. */
export function nomAffiche(eleve: Pick<Eleve, 'prenom' | 'nom'>): string {
  const initiale = eleve.nom.trim().charAt(0).toUpperCase()
  return initiale ? `${eleve.prenom.trim()} ${initiale}.` : eleve.prenom.trim()
}

export function classer(tentatives: Tentative[], eleves: Map<string, Eleve>, limite = 10): LigneClassement[] {
  const lignes = tentatives
    .filter((t) => t.statut === 'soumise' || t.statut === 'expiree')
    .map((t) => ({
      eleve_id: t.eleve_id,
      score: t.score ?? 0,
      temps_total_ms: t.temps_total_ms ?? Number.MAX_SAFE_INTEGER,
      nom_affiche: eleves.has(t.eleve_id) ? nomAffiche(eleves.get(t.eleve_id)!) : '—',
    }))
    .sort((a, b) => b.score - a.score || a.temps_total_ms - b.temps_total_ms)

  // rang « compétition » : deux lignes strictement identiques partagent le rang
  const classees: LigneClassement[] = []
  lignes.forEach((l, i) => {
    const prec = lignes[i - 1]
    const rang = prec && prec.score === l.score && prec.temps_total_ms === l.temps_total_ms ? classees[i - 1].rang : i + 1
    classees.push({ ...l, rang })
  })
  return classees.slice(0, limite)
}
