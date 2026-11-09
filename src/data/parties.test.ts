import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Personnel } from '../types'
import { BaseCamp } from './db'
import { creerRepositoryLocal } from './localRepository'
import { creerStaffRepositoryLocal } from './localStaffRepository'
import { reinitialiserDemo } from './seed'
import { ErreurDroits } from './staffRepository'

let db: BaseCamp
let staff: ReturnType<typeof creerStaffRepositoryLocal>
let eleves: ReturnType<typeof creerRepositoryLocal>
let edem: Personnel
let komla: Personnel

beforeEach(async () => {
  db = new BaseCamp(`parties-${Math.random()}`)
  await reinitialiserDemo(db)
  staff = creerStaffRepositoryLocal(db)
  eleves = creerRepositoryLocal(db)
  const liste = await staff.comptesDemo()
  edem = liste.find((p) => p.prenom === 'Edem')!
  komla = liste.find((p) => p.prenom === 'Komla')!
})

async function fichesRobot() {
  const f = await db.fiche.toArray()
  const de = (type: string) => f.find((x) => x.type === type && x.titre_fr && x.statut_validation === 'validee')!
  return { pre: de('pretest'), quiz: de('quiz'), post: de('posttest') }
}

describe('parties d’atelier', () => {
  it('le déroulé d’une partie arrive dans chaque groupe, sans doublon, avec son code source', async () => {
    const [groupe] = await staff.groupesPour(komla)
    const { pre, quiz, post } = await fichesRobot()
    const avant = (await staff.detailGroupe(groupe.groupe.id, komla)).activites.length

    await expect(staff.enregistrerPartie({ partie: { atelier_id: groupe.atelier.id, ordre: 1, titre_fr: 'IoT' }, ressources: [] }, komla))
      .rejects.toBeInstanceOf(ErreurDroits)
    await expect(staff.enregistrerPartie({ partie: { atelier_id: groupe.atelier.id, ordre: 1, titre_fr: 'IoT', fiche_quiz_id: pre.id }, ressources: [] }, edem))
      .rejects.toThrow('bon type')

    const saisie = {
      partie: { atelier_id: groupe.atelier.id, ordre: 1, titre_fr: 'IoT', fiche_pretest_id: pre.id, fiche_quiz_id: quiz.id, fiche_posttest_id: post.id },
      ressources: [{ titre: 'LED', langage: 'arduino', contenu: 'void setup() {}' }, { titre: '', contenu: '  ' }],
    }
    const id = await staff.enregistrerPartie(saisie, edem)
    await staff.enregistrerPartie({ ...saisie, partie: { ...saisie.partie, id } }, edem)

    const d = await staff.detailGroupe(groupe.groupe.id, komla)
    expect(d.activites.length).toBe(avant + 3)
    expect(d.activites.slice(0, 3).map((a) => [a.fiche.type, a.session.partie_id, a.session.statut]))
      .toEqual([['pretest', id, 'brouillon'], ['quiz', id, 'brouillon'], ['posttest', id, 'brouillon']])
    expect(d.parties?.[0].ressources.map((r) => r.contenu)).toEqual(['void setup() {}'])

    // un groupe créé ensuite reçoit le même déroulé
    await staff.enregistrerGroupe({ id: 'nouveau', atelier_id: groupe.atelier.id, nom: 'Jour 2', date: '2026-12-02', heure_debut: '09:00', heure_fin: '12:00' }, [], edem)
    expect((await staff.detailGroupe('nouveau', edem)).activites).toHaveLength(3)

    // l'élève voit la partie et le code (atelier démarré)
    const eleve = (await staff.detailGroupe(groupe.groupe.id, komla)).eleves[0]
    const vue = (await eleves.ateliersPourEleve(eleve.id)).find((a) => a.groupe.id === groupe.groupe.id)!
    expect(vue.parties?.[0].partie.titre_fr).toBe('IoT')
    expect(vue.parties?.[0].ressources).toHaveLength(1)
    expect(vue.activites[0].session.partie_id).toBe(id)

    // export : une ligne par élève et activité notée
    const lignes = await staff.exportResultats(groupe.atelier.camp_id, edem)
    expect(lignes.some((l) => l.partie === 'IoT' && l.type === 'pretest' && l.eleve.id === eleve.id && l.score === undefined)).toBe(true)
    await expect(staff.exportResultats(groupe.atelier.camp_id, komla)).rejects.toBeInstanceOf(ErreurDroits)

    await staff.supprimerPartie(id, edem)
    expect((await staff.detailGroupe('nouveau', edem)).activites).toHaveLength(0)
  })
})
