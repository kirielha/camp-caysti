import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Personnel } from '../types'
import { BaseCamp } from './db'
import { creerRepositoryLocal, DELAI_GRACE_MS } from './localRepository'
import { creerStaffRepositoryLocal } from './localStaffRepository'
import { reinitialiserDemo } from './seed'
import { ErreurDroits } from './staffRepository'

let db: BaseCamp
let staff: ReturnType<typeof creerStaffRepositoryLocal>
let repo: ReturnType<typeof creerRepositoryLocal>
let komla: Personnel
let quiz: string

beforeEach(async () => {
  db = new BaseCamp(`pilote-${Math.random()}`)
  await reinitialiserDemo(db)
  staff = creerStaffRepositoryLocal(db)
  repo = creerRepositoryLocal(db)
  komla = (await staff.comptesDemo()).find((p) => p.prenom === 'Komla')!
  const [robot] = await staff.groupesPour(komla)
  quiz = (await staff.detailGroupe(robot.groupe.id, komla)).activites.find((a) => a.fiche.type === 'quiz')!.session.id
})

const eleve = async (code: string) => (await repo.trouverEleveParCode(code))!
const bonnes = async (index: number) => {
  const { questions } = await repo.etatPilote(quiz)
  return questions[index].choix.filter((c) => c.est_correct).map((c) => c.id)
}

describe('mode piloté', () => {
  it('partie complète : salle d’attente, questions au rythme du formateur, classement, clôture', async () => {
    await staff.changerModeSession(quiz, 'pilote', komla)
    const ama = await eleve('AMA234')
    const yaw = await eleve('YAW567')

    // le mode libre est refusé pour une session pilotée
    await expect(repo.demarrerTentative(quiz, ama.id, 'fr')).rejects.toMatchObject({ code: 'session_pilotee' })

    const tAma = await repo.rejoindreSessionPilotee(quiz, ama.id, 'fr')
    const tYaw = await repo.rejoindreSessionPilotee(quiz, yaw.id, 'en')
    let etat = await repo.etatPilote(quiz)
    expect(etat.detail.session.etape).toBe('attente')
    expect(etat.index).toBe(-1)
    expect(etat.participants.map((p) => p.eleve.prenom)).toEqual(['Ama', 'Yaw'])

    // avant le lancement, aucune réponse n'est acceptée
    const q1 = etat.questions[0].id
    await expect(repo.repondrePilote(tAma.id, q1, { choix_coches: [] })).rejects.toMatchObject({ code: 'hors_question' })

    // question 1 : Ama répond juste, Yaw faux
    await staff.piloter(quiz, 'suivante', komla)
    etat = await repo.etatPilote(quiz)
    expect([etat.detail.session.etape, etat.index]).toEqual(['question', 0])
    await repo.repondrePilote(tAma.id, q1, { choix_coches: await bonnes(0) })
    const fausse = etat.questions[0].choix.find((c) => !c.est_correct)!.id
    await repo.repondrePilote(tYaw.id, q1, { choix_coches: [fausse] })
    // une seule réponse par question
    await expect(repo.repondrePilote(tAma.id, q1, { choix_coches: [fausse] })).rejects.toMatchObject({ code: 'deja_repondu' })
    expect((await repo.etatPilote(quiz)).reponsesQuestion).toHaveLength(2)

    await staff.piloter(quiz, 'reveler', komla)
    // après la révélation, plus de réponse possible
    const kemi = await eleve('KEM789')
    const tKemi = await repo.rejoindreSessionPilotee(quiz, kemi.id, 'fr') // arrivée en retard : acceptée
    await expect(repo.repondrePilote(tKemi.id, q1, { choix_coches: await bonnes(0) })).rejects.toMatchObject({ code: 'hors_question' })

    await staff.piloter(quiz, 'classement', komla)
    const inter = await repo.classementEnDirect(quiz)
    expect(inter.map((l) => [l.nom_affiche, l.score])).toEqual([['Ama M.', 1], ['Yaw A.', 0], ['Kemi A.', 0]])

    // questions 2 et 3 : seul Yaw répond juste, deux fois
    for (const i of [1, 2]) {
      await staff.piloter(quiz, 'suivante', komla)
      const e = await repo.etatPilote(quiz)
      await repo.repondrePilote(tYaw.id, e.questions[i].id, { choix_coches: await bonnes(i) })
    }
    // « suivante » après la dernière question termine la partie
    await staff.piloter(quiz, 'suivante', komla)
    etat = await repo.etatPilote(quiz)
    expect(etat.detail.session).toMatchObject({ etape: 'terminee', statut: 'fermee' })
    const final = await repo.classement(quiz)
    expect(final.map((l) => [l.nom_affiche, l.score])).toEqual([['Yaw A.', 3], ['Ama M.', 1], ['Kemi A.', 0]])
    expect((await db.tentative.get(tYaw.id))).toMatchObject({ statut: 'soumise', score: 3, score_max: 4 })
    await expect(repo.rejoindreSessionPilotee(quiz, ama.id, 'fr')).rejects.toMatchObject({ code: 'session_fermee' })
  })

  it('le temps de réponse est compté depuis le lancement ; une réponse trop tardive est refusée', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-12-01T10:00:00Z'))
      await staff.changerModeSession(quiz, 'pilote', komla)
      const ama = await eleve('AMA234')
      const yaw = await eleve('YAW567')
      const tAma = await repo.rejoindreSessionPilotee(quiz, ama.id, 'fr')
      const tYaw = await repo.rejoindreSessionPilotee(quiz, yaw.id, 'fr')
      await staff.piloter(quiz, 'suivante', komla) // question de 15 s
      const q = (await repo.etatPilote(quiz)).questions[0].id

      vi.setSystemTime(new Date('2026-12-01T10:00:04Z'))
      expect((await repo.repondrePilote(tAma.id, q, { choix_coches: await bonnes(0) })).temps_ms).toBe(4000)

      vi.setSystemTime(new Date(Date.parse('2026-12-01T10:00:15Z') + DELAI_GRACE_MS + 1))
      await expect(repo.repondrePilote(tYaw.id, q, { choix_coches: await bonnes(0) })).rejects.toMatchObject({ code: 'hors_question' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('le mode ne change plus une fois que des élèves ont commencé ; seul le formateur du groupe pilote', async () => {
    await staff.changerModeSession(quiz, 'pilote', komla)
    const akossiwaEtrangere = (await staff.comptesDemo()).find((p) => p.prenom === 'Akossiwa')!
    // Akossiwa est formatrice secondaire du groupe robotique : elle peut piloter
    await staff.piloter(quiz, 'suivante', akossiwaEtrangere)
    await repo.rejoindreSessionPilotee(quiz, (await eleve('AMA234')).id, 'fr')
    await expect(staff.changerModeSession(quiz, 'libre', komla)).rejects.toBeInstanceOf(ErreurDroits)
  })

  it('l’écran est prévenu à chaque changement de la partie', async () => {
    await staff.changerModeSession(quiz, 'pilote', komla)
    const signaux: number[] = []
    const arreter = repo.surveillerSession(quiz, () => signaux.push(Date.now()))
    await new Promise((r) => setTimeout(r, 50))
    const avant = signaux.length
    await staff.piloter(quiz, 'suivante', komla)
    await new Promise((r) => setTimeout(r, 50))
    expect(signaux.length).toBeGreaterThan(avant)
    arreter()
  })
})
