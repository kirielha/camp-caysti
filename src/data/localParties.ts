// Parties d'atelier en stockage local : mêmes règles que la migration 0008.
import { nouvelId } from '../lib/ids'
import type { PartieAvecRessources, SessionEvaluation, TypeFiche } from '../types'
import type { BaseCamp } from './db'

const RANG: Record<TypeFiche, number> = { pretest: 0, quiz: 1, posttest: 2, satisfaction: 3 }

export async function partiesDe(db: BaseCamp, atelierId: string, avecRessources = true): Promise<PartieAvecRessources[]> {
  const parties = (await db.partie.where('atelier_id').equals(atelierId).toArray()).sort((a, b) => a.ordre - b.ordre)
  return Promise.all(parties.map(async (partie) => ({
    partie,
    ressources: avecRessources
      ? (await db.ressource.where('partie_id').equals(partie.id).toArray()).sort((a, b) => a.ordre - b.ordre)
      : [],
  })))
}

/** Ordre du déroulé : partie, puis prétest, quiz, post-test, avis (activités sans partie à la fin). */
export function comparerActivites(ordrePartie: Map<string, number>) {
  return (a: { session: SessionEvaluation; fiche: { type: TypeFiche } }, b: { session: SessionEvaluation; fiche: { type: TypeFiche } }) =>
    (ordrePartie.get(a.session.partie_id ?? '') ?? 1e6) - (ordrePartie.get(b.session.partie_id ?? '') ?? 1e6)
    || RANG[a.fiche.type] - RANG[b.fiche.type]
}

export async function ordreDesParties(db: BaseCamp, atelierId: string) {
  return new Map((await db.partie.where('atelier_id').equals(atelierId).toArray()).map((p) => [p.id, p.ordre]))
}

/** Chaque fiche des parties de l'atelier devient une activité fermée du groupe, si elle n'y est pas déjà. */
export async function appliquerDeroule(db: BaseCamp, groupeId: string) {
  const groupe = await db.groupe.get(groupeId)
  if (!groupe) return
  const existantes = await db.session_evaluation.where('groupe_id').equals(groupeId).toArray()
  const parties = (await db.partie.where('atelier_id').equals(groupe.atelier_id).toArray()).sort((a, b) => a.ordre - b.ordre)
  for (const p of parties) {
    for (const ficheId of [p.fiche_pretest_id, p.fiche_quiz_id, p.fiche_posttest_id]) {
      if (!ficheId || existantes.some((s) => s.partie_id === p.id && s.fiche_id === ficheId)) continue
      const fiche = await db.fiche.get(ficheId)
      if (!fiche) continue
      await db.session_evaluation.add({
        id: nouvelId(), fiche_id: fiche.id, groupe_id: groupeId, partie_id: p.id, mode: 'libre', mode_correction: fiche.mode_correction,
        statut: 'brouillon', classement_affiche: fiche.type !== 'satisfaction', etape: 'attente',
      })
    }
  }
}
