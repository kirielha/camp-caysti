// Règles de notation — identiques à la fonction SQL score_qcm()
// de supabase/migrations/0001_schema.sql. Toute modification doit être
// reportée des deux côtés (les tests de scoring.test.ts servent de garde-fou).

import type { Choix, Question, Reponse, StatutCorrection } from '../types'

const arrondi = (n: number) => Math.round(n * 100) / 100

/** Score d'un QCM. Jamais de pénalité pour une mauvaise case cochée. */
export function scoreQcm(question: Pick<Question, 'type' | 'points' | 'mode_bareme'>, choix: Choix[], coches: string[]): number {
  const bons = new Set(choix.filter((c) => c.est_correct).map((c) => c.id))
  const cochesUniques = new Set(coches)
  if (bons.size === 0) return 0

  const nbBonsCoches = [...cochesUniques].filter((id) => bons.has(id)).length
  const exact = nbBonsCoches === bons.size && cochesUniques.size === bons.size

  if (question.type === 'qcm_unique' || question.mode_bareme === 'tout_ou_rien') {
    return exact ? question.points : 0
  }
  // proportionnel : bonnes cases cochées / bonnes cases attendues
  return arrondi((question.points * nbBonsCoches) / bons.size)
}

/** Une question compte-t-elle dans le score maximal ? */
export function estNotee(type: Question['type']): boolean {
  return type === 'qcm_unique' || type === 'qcm_multiple' || type === 'qro_ia'
}

/** Notation immédiate d'une réponse au moment où l'élève la donne. */
export function noterReponse(
  question: Question,
  choix: Choix[],
  coches: string[],
): { score_final?: number; statut_correction: StatutCorrection } {
  switch (question.type) {
    case 'qcm_unique':
    case 'qcm_multiple':
      return { score_final: scoreQcm(question, choix, coches), statut_correction: 'auto' }
    case 'qro_ia':
      // corrigée plus tard par l'IA (et éventuellement validée par le formateur)
      return { statut_correction: 'en_attente' }
    default:
      // QRO qualitative, échelle de satisfaction : non notées
      return { statut_correction: 'auto' }
  }
}

/** Score total d'une tentative : seules les réponses déjà corrigées comptent. */
export function totaliser(questions: Question[], reponses: Reponse[]) {
  const score = arrondi(reponses.reduce((s, r) => s + (r.score_final ?? 0), 0))
  const score_max = arrondi(questions.filter((q) => estNotee(q.type)).reduce((s, q) => s + q.points, 0))
  const temps_total_ms = reponses.reduce((s, r) => s + (r.temps_ms ?? 0), 0)
  const en_attente = reponses.filter((r) => r.statut_correction === 'en_attente').length
  return { score, score_max, temps_total_ms, en_attente }
}

/**
 * Temps total d'une partie pilotée : une question lancée sans réponse compte pour toute sa durée.
 * Sinon un élève qui ne répond pas (temps 0) passerait devant, à score égal, celui qui a répondu.
 */
export function tempsPilote(questionsLancees: Pick<Question, 'id' | 'duree_secondes'>[], reponses: Reponse[]): number {
  return questionsLancees.reduce((total, q) => {
    const r = reponses.find((x) => x.question_id === q.id)
    return total + (r?.temps_ms ?? q.duree_secondes * 1000)
  }, 0)
}
