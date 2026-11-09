import { describe, expect, it } from 'vitest'
import type { Eleve, LigneExport } from '../types'
import { analyserResultats } from './exportsExcel'

const eleve = (id: string, nom: string): Eleve => ({ id, code_acces: 'ABC234', nom, prenom: 'X', date_naissance: '2014-01-01', sexe: 'F', classe: 'CM2', langue_interface: 'fr' })
const base = { atelier: 'Distributeur de jus', groupe: 'Jour 1', date: '2026-11-10', fiche: 'f' }
const l = (e: Eleve, partie: string, ordre: number, type: LigneExport['type'], score?: number): LigneExport =>
  ({ ...base, eleve: e, partie, partie_ordre: ordre, type, score, score_max: score === undefined ? undefined : 10, statut: score === undefined ? undefined : 'soumise' })

describe('analyse des résultats', () => {
  it('une ligne par élève et partie, progression en points, synthèse sur les élèves complets', () => {
    const a = eleve('a', 'AKAKPO'), b = eleve('b', 'BANKA')
    const { eleves, synthese } = analyserResultats([
      l(a, 'IoT', 1, 'pretest', 4), l(a, 'IoT', 1, 'quiz', 6), l(a, 'IoT', 1, 'posttest', 9),
      l(b, 'IoT', 1, 'pretest', 5), l(b, 'IoT', 1, 'quiz'), l(b, 'IoT', 1, 'posttest'),
      l(a, 'Programmation', 2, 'pretest', 2), l(a, 'Programmation', 2, 'posttest', 7),
    ])
    expect(eleves.map((e) => [e.eleve.nom, e.partie, e.pre, e.quiz, e.post, e.progression])).toEqual([
      ['AKAKPO', 'IoT', 40, 60, 90, 50],
      ['BANKA', 'IoT', 50, undefined, undefined, undefined],
      ['AKAKPO', 'Programmation', 20, undefined, 70, 50],
    ])
    expect(synthese[0]).toMatchObject({ partie: 'IoT', inscrits: 2, pre_et_post: 1, moyenne_pre: 45, moyenne_post: 90, progression_moyenne: 50 })
    expect(synthese[1]).toMatchObject({ partie: 'Programmation', inscrits: 1 })
  })

  it('une tentative en cours ne compte pas', () => {
    const a = eleve('a', 'A')
    const { eleves } = analyserResultats([{ ...l(a, 'IoT', 1, 'pretest', 3), statut: 'en_cours' }])
    expect(eleves[0].pre).toBeUndefined()
  })
})
