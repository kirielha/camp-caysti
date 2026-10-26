import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BaseCamp } from './db'
import { creerRepositoryLocal } from './localRepository'
import { ErreurMetier } from './repository'
import { reinitialiserDemo } from './seed'

let db: BaseCamp
let repo: ReturnType<typeof creerRepositoryLocal>

beforeEach(async () => {
  db = new BaseCamp(`test-${Math.random()}`)
  await reinitialiserDemo(db)
  repo = creerRepositoryLocal(db)
})

describe('parcours élève (stockage local)', () => {
  it('retrouve un élève par son code, sans tenir compte de la casse ni des espaces', async () => {
    const e = await repo.trouverEleveParCode(' ama 234 ')
    expect(e?.prenom).toBe('Ama')
    expect(await repo.trouverEleveParCode('ZZZZZZ')).toBeUndefined()
  })

  it('liste les sessions ouvertes, prétest en premier', async () => {
    const e = (await repo.trouverEleveParCode('AMA234'))!
    const sessions = await repo.sessionsPourEleve(e.id)
    expect(sessions.map((s) => s.fiche.type)).toEqual(['pretest', 'quiz', 'satisfaction'])
  })

  it('passe un prétest complet : notation, attente de la QRO IA, classement', async () => {
    const e = (await repo.trouverEleveParCode('AMA234'))!
    const [pre] = await repo.sessionsPourEleve(e.id)
    const { questions } = await repo.chargerSession(pre.session.id)
    const { tentative } = await repo.demarrerTentative(pre.session.id, e.id, 'fr')

    const bons = (i: number) => questions[i].choix.filter((c) => c.est_correct).map((c) => c.id)
    await repo.enregistrerReponse(tentative.id, questions[0].id, { choix_coches: bons(0), temps_ms: 8000 })
    // QCM multiple proportionnel : 2 bonnes sur 3 + une fausse → 2 points sur 3, sans pénalité
    const fausse = questions[1].choix.find((c) => !c.est_correct)!.id
    const r2 = await repo.enregistrerReponse(tentative.id, questions[1].id, { choix_coches: [...bons(1).slice(0, 2), fausse], temps_ms: 15000 })
    expect(r2.score_final).toBe(2)
    await repo.enregistrerReponse(tentative.id, questions[2].id, { choix_coches: bons(2), temps_ms: 5000 })
    await repo.enregistrerReponse(tentative.id, questions[3].id, { choix_coches: [], temps_ms: 25000 }) // temps écoulé
    const r5 = await repo.enregistrerReponse(tentative.id, questions[4].id, { choix_coches: [], texte: 'Une machine qui bouge', temps_ms: 40000 })
    expect(r5.statut_correction).toBe('en_attente')
    await repo.enregistrerReponse(tentative.id, questions[5].id, { choix_coches: [], texte: 'Un robot qui arrose', temps_ms: 20000 })

    const { tentative: finie, en_attente } = await repo.soumettreTentative(tentative.id)
    expect(finie.score).toBe(4) // 1 + 2 + 1 + 0, QRO IA en attente
    expect(finie.score_max).toBe(8) // 1 + 3 + 1 + 1 + 2 ; la QRO qualitative ne compte pas
    expect(finie.temps_total_ms).toBe(113000)
    expect(en_attente).toBe(1)

    const top = await repo.classement(pre.session.id)
    expect(top).toHaveLength(9)
    // 4 points comme Mawuli K. (120 s) mais en 113 s : Ama passe devant, juste derrière
    const iAma = top.findIndex((l) => l.nom_affiche === 'Ama M.')
    const iMawuli = top.findIndex((l) => l.nom_affiche === 'Mawuli K.')
    expect(iAma).toBe(iMawuli - 1)
  })

  it('reprend une tentative en cours mais refuse une seconde tentative', async () => {
    const e = (await repo.trouverEleveParCode('YAW567'))!
    const [pre] = await repo.sessionsPourEleve(e.id)
    const { questions } = await repo.chargerSession(pre.session.id)
    const a = await repo.demarrerTentative(pre.session.id, e.id, 'fr')
    await repo.enregistrerReponse(a.tentative.id, questions[0].id, { choix_coches: [], temps_ms: 1000 })
    const b = await repo.demarrerTentative(pre.session.id, e.id, 'fr')
    expect(b.tentative.id).toBe(a.tentative.id)
    expect(b.reponses).toHaveLength(1)
    await repo.soumettreTentative(a.tentative.id)
    await expect(repo.demarrerTentative(pre.session.id, e.id, 'fr')).rejects.toBeInstanceOf(ErreurMetier)
  })
})
