import { describe, expect, it } from 'vitest'
import type { Choix, Eleve, Tentative } from '../types'
import { classer, nomAffiche } from './ranking'
import { scoreQcm } from './scoring'

const choix = (bons: boolean[]): Choix[] =>
  bons.map((est_correct, i) => ({ id: `c${i}`, question_id: 'q', texte_fr: `${i}`, est_correct, ordre: i }))

describe('scoreQcm — mêmes cas que le test SQL', () => {
  const c = choix([true, true, false]) // 2 bonnes réponses sur 3
  const prop = { type: 'qcm_multiple' as const, points: 3, mode_bareme: 'proportionnel' as const }
  const tor = { ...prop, mode_bareme: 'tout_ou_rien' as const }

  it('proportionnel : 1 bonne + 1 fausse = 1,5 (pas de pénalité)', () => {
    expect(scoreQcm(prop, c, ['c0', 'c2'])).toBe(1.5)
  })
  it('proportionnel : 2 bonnes = 3', () => {
    expect(scoreQcm(prop, c, ['c1', 'c0'])).toBe(3)
  })
  it('tout ou rien : sélection exacte, ordre inversé = 3', () => {
    expect(scoreQcm(tor, c, ['c1', 'c0'])).toBe(3)
  })
  it('tout ou rien : une case fausse en plus = 0', () => {
    expect(scoreQcm(tor, c, ['c0', 'c1', 'c2'])).toBe(0)
  })
  it('QCM unique : bonne réponse = tous les points, sinon 0', () => {
    const u = choix([false, true, false])
    const q = { type: 'qcm_unique' as const, points: 2, mode_bareme: 'tout_ou_rien' as const }
    expect(scoreQcm(q, u, ['c1'])).toBe(2)
    expect(scoreQcm(q, u, ['c0'])).toBe(0)
    expect(scoreQcm(q, u, [])).toBe(0)
  })
})

describe('classement', () => {
  const eleve = (id: string, prenom: string, nom: string) =>
    ({ id, prenom, nom }) as Eleve
  const eleves = new Map([
    ['k', eleve('k', 'Koffi', 'Amegah')],
    ['a', eleve('a', 'Ama', 'Doe')],
    ['y', eleve('y', 'Yao', 'Lawson')],
  ])
  const t = (eleve_id: string, score: number, temps_total_ms: number): Tentative => ({
    id: eleve_id, session_id: 's', eleve_id, langue: 'fr', debut: '', score, temps_total_ms, statut: 'soumise',
  })

  it('à égalité de score, le plus rapide passe devant', () => {
    const r = classer([t('k', 3, 50000), t('a', 3, 42000), t('y', 1, 42000)], eleves)
    expect(r.map((l) => [l.rang, l.nom_affiche])).toEqual([[1, 'Ama D.'], [2, 'Koffi A.'], [3, 'Yao L.']])
  })
  it('limite au top 10 et ignore les tentatives en cours', () => {
    const beaucoup = Array.from({ length: 15 }, (_, i) => t(`e${i}`, i, 1000))
    beaucoup.push({ ...t('k', 99, 1), statut: 'en_cours' })
    const r = classer(beaucoup, eleves)
    expect(r).toHaveLength(10)
    expect(r[0].score).toBe(14)
  })
  it('affiche prénom + initiale du nom', () => {
    expect(nomAffiche({ prenom: 'Koffi', nom: 'amegah' })).toBe('Koffi A.')
  })
})
