import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { analyserFeuille, COLONNES } from '../lib/importEleves'
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
let campId: string

beforeEach(async () => {
  db = new BaseCamp(`camp-${Math.random()}`)
  await reinitialiserDemo(db)
  staff = creerStaffRepositoryLocal(db)
  eleves = creerRepositoryLocal(db)
  const comptes = await staff.comptesDemo()
  edem = comptes.find((p) => p.prenom === 'Edem')!
  komla = comptes.find((p) => p.prenom === 'Komla')!
  campId = (await staff.camps())[0].id
})

describe('ateliers et groupes', () => {
  it('structure du camp : ateliers, groupes, formateurs, effectifs', async () => {
    const s = await staff.structureCamp(campId)
    expect(s.map((a) => [a.atelier.titre_fr, a.groupes.map((g) => [g.groupe.nom, g.nb_eleves, g.formateurs.length])])).toEqual([
      ['Mon premier robot', [['Groupe A', 11, 2]]],
      ['Imprimer en 3D', [['Groupe B', 11, 1]]],
    ])
  })

  it('ajoute un groupe parallèle avec ses formateurs ; refuse deux principaux ou des horaires inversés', async () => {
    const [robot] = await staff.structureCamp(campId)
    const formateurs = await staff.formateurs()
    const akossiwa = formateurs.find((f) => f.prenom === 'Akossiwa')!
    const groupe = { id: crypto.randomUUID(), atelier_id: robot.atelier.id, nom: 'Groupe C', date: '2026-12-01', heure_debut: '09:00', heure_fin: '12:00', salle: 'Salle 2' }

    await expect(staff.enregistrerGroupe(groupe, [], komla)).rejects.toBeInstanceOf(ErreurDroits) // un formateur ne crée pas de groupe
    await expect(staff.enregistrerGroupe({ ...groupe, heure_fin: '08:00' }, [], edem)).rejects.toThrow('L’heure de fin doit être après l’heure de début')
    await expect(staff.enregistrerGroupe(groupe, [
      { utilisateur_id: akossiwa.id, role: 'principal' }, { utilisateur_id: komla.id, role: 'principal' },
    ], edem)).rejects.toThrow('Un groupe n’a qu’un formateur principal')

    await staff.enregistrerGroupe(groupe, [{ utilisateur_id: akossiwa.id, role: 'principal' }], edem)
    const apres = (await staff.structureCamp(campId))[0]
    expect(apres.groupes.map((g) => g.groupe.nom)).toEqual(['Groupe A', 'Groupe C'])
    expect(apres.groupes[1].groupe.statut).toBe('a_venir')
    // Akossiwa retrouve ce nouveau groupe dans « Mes groupes »
    expect((await staff.groupesPour((await staff.personnel(akossiwa.id))!)).some((g) => g.groupe.nom === 'Groupe C')).toBe(true)
  })

  it('un groupe où des élèves ont déjà composé ne peut plus être supprimé', async () => {
    const [robot] = await staff.structureCamp(campId)
    await expect(staff.supprimerGroupe(robot.groupes[0].groupe.id, edem)).rejects.toThrow(/ne peut plus être supprimé/)
  })
})

describe('élèves', () => {
  it('inscrit un élève : code généré, parent enregistré, inscription aux groupes choisis', async () => {
    const [robot, impression] = await staff.structureCamp(campId)
    const cree = await staff.enregistrerEleve(campId, {
      eleve: { id: crypto.randomUUID(), nom: 'agbo', prenom: ' Yao ', date_naissance: '2013-04-10', sexe: 'M', classe: '6e', langue_interface: 'fr' },
      tuteur: { nom: 'M. Agbo', telephone: '+228 90 11 22 33' },
      groupeIds: [robot.groupes[0].groupe.id],
    }, edem)
    expect(cree).toMatchObject({ nom: 'AGBO', prenom: 'Yao' })
    expect(cree.code_acces).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/)
    // l'élève se connecte avec ce code et voit son atelier
    const e = await eleves.trouverEleveParCode(cree.code_acces)
    expect((await eleves.ateliersPourEleve(e!.id)).map((a) => a.atelier.titre_fr)).toEqual(['Mon premier robot'])

    // modification : ajout du second atelier, le code ne change pas
    const fiche = (await staff.elevesDuCamp(campId)).find((x) => x.eleve.id === cree.id)!
    expect(fiche.tuteur?.telephone).toBe('+228 90 11 22 33')
    const modifie = await staff.enregistrerEleve(campId, {
      eleve: fiche.eleve, tuteur: fiche.tuteur!, groupeIds: [robot.groupes[0].groupe.id, impression.groupes[0].groupe.id],
    }, edem)
    expect(modifie.code_acces).toBe(cree.code_acces)
    expect((await eleves.ateliersPourEleve(cree.id))).toHaveLength(2)
  })

  it('refuse un élève sans contact du parent', async () => {
    await expect(staff.enregistrerEleve(campId, {
      eleve: { id: crypto.randomUUID(), nom: 'X', prenom: 'Y', date_naissance: '2013-01-01', sexe: 'F', classe: '5e', langue_interface: 'fr' },
      tuteur: { nom: 'Parent' }, groupeIds: [],
    }, edem)).rejects.toThrow('Indiquez au moins un contact du parent')
  })
})

describe('import Excel', () => {
  it('crée les nouveaux élèves, rattache ceux qui reviennent, crée chaque école une seule fois, ignore les lignes en erreur', async () => {
    const [robot] = await staff.structureCamp(campId)
    const ligne = (v: Partial<Record<(typeof COLONNES)[number], string>>) => COLONNES.map((c) => v[c] ?? null)
    const { lignes } = analyserFeuille([
      [...COLONNES],
      ligne({ Nom: 'Mensah', Prénom: 'Ama', 'Date de naissance': '12/05/2014', Sexe: 'F', Classe: 'CM2', 'Téléphone du parent': '90' }), // revient
      ligne({ Nom: 'Kodjo', Prénom: 'Elom', 'Date de naissance': '05/06/2013', Sexe: 'M', Classe: '6ème', École: 'EPP Agoè', 'Téléphone du parent': '91' }),
      ligne({ Nom: 'Kodjo', Prénom: 'Dela', 'Date de naissance': '05/06/2015', Sexe: 'F', Classe: 'CE2', École: 'epp agoe', 'WhatsApp du parent': '92' }),
      ligne({ Nom: 'Sans', Prénom: 'Classe', 'Date de naissance': '01/01/2013', Sexe: 'F', Classe: '', 'Téléphone du parent': '93' }), // erreur
    ], {
      ecoles: await staff.ecoles(), langues: await staff.langues(), eleves: await staff.identitesEleves(),
      dateReference: new Date('2026-12-01T00:00:00Z'),
    })
    const amaAvant = (await eleves.trouverEleveParCode('AMA234'))!

    const { crees, rattaches } = await staff.importerEleves(campId, lignes, [robot.groupes[0].groupe.id], 'liste-agoe.xlsx', edem)
    expect(crees.map((e) => e.prenom)).toEqual(['Elom', 'Dela'])
    expect(rattaches.map((e) => e.id)).toEqual([amaAvant.id]) // même élève, même code
    expect(new Set(crees.map((e) => e.code_acces)).size).toBe(2)

    const ecoles = (await staff.ecoles()).filter((e) => e.nom === 'EPP Agoè')
    expect(ecoles).toHaveLength(1) // « EPP Agoè » et « epp agoe » : une seule école créée
    expect(crees.every((e) => e.ecole_id === ecoles[0].id)).toBe(true)

    const lot = await db.lot_import.toArray()
    expect(lot).toMatchObject([{ fichier: 'liste-agoe.xlsx', lignes_ok: 3, lignes_erreur: 1 }])
    expect((await staff.elevesDuCamp(campId))).toHaveLength(13)

    // réimporter le même fichier ne duplique personne
    const deuxieme = analyserFeuille([[...COLONNES], ligne({ Nom: 'Kodjo', Prénom: 'Elom', 'Date de naissance': '05/06/2013', Sexe: 'M', Classe: '6e', 'Téléphone du parent': '91' })], {
      ecoles: await staff.ecoles(), langues: await staff.langues(), eleves: await staff.identitesEleves(),
    })
    const r2 = await staff.importerEleves(campId, deuxieme.lignes, [robot.groupes[0].groupe.id], 'liste-agoe.xlsx', edem)
    expect(r2.crees).toHaveLength(0)
    expect(r2.rattaches.map((e) => e.prenom)).toEqual(['Elom'])
  })
})
