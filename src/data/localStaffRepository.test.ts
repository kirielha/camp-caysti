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
let comptes: Record<'arielle' | 'edem' | 'komla' | 'akossiwa', Personnel>

beforeEach(async () => {
  db = new BaseCamp(`staff-${Math.random()}`)
  await reinitialiserDemo(db)
  staff = creerStaffRepositoryLocal(db)
  eleves = creerRepositoryLocal(db)
  const liste = await staff.comptesDemo()
  const par = (prenom: string) => liste.find((p) => p.prenom === prenom)!
  comptes = { arielle: par('Arielle'), edem: par('Edem'), komla: par('Komla'), akossiwa: par('Akossiwa') }
})

describe('espace personnel : groupes et pilotage', () => {
  it('chaque formateur voit ses groupes, un admin voit tous ceux de son camp', async () => {
    const titres = async (p: Personnel) => (await staff.groupesPour(p)).map((g) => [g.atelier.titre_fr, g.role ?? '—'])
    expect(await titres(comptes.komla)).toEqual([['Mon premier robot', 'principal']])
    expect(await titres(comptes.akossiwa)).toEqual([['Mon premier robot', 'secondaire'], ['Imprimer en 3D', 'principal']])
    expect(await titres(comptes.edem)).toEqual([['Mon premier robot', '—'], ['Imprimer en 3D', '—']])
  })

  it('un formateur ne pilote pas le groupe d’un autre ; l’admin du camp, si', async () => {
    const [, groupe3d] = await staff.groupesPour(comptes.akossiwa)
    await expect(staff.changerStatutGroupe(groupe3d.groupe.id, 'en_cours', comptes.komla)).rejects.toBeInstanceOf(ErreurDroits)
    await staff.changerStatutGroupe(groupe3d.groupe.id, 'en_cours', comptes.edem)
    expect((await db.groupe.get(groupe3d.groupe.id))?.statut).toBe('en_cours')
  })

  it('détail d’un groupe : formateurs, élèves, activités avec leur avancement', async () => {
    const [robot] = await staff.groupesPour(comptes.komla)
    const d = await staff.detailGroupe(robot.groupe.id, comptes.komla)
    expect(d.formateurs.map((f) => [f.utilisateur.prenom, f.role])).toEqual([['Komla', 'principal'], ['Akossiwa', 'secondaire']])
    expect(d.eleves).toHaveLength(11)
    expect(d.activites.map((a) => [a.fiche.type, a.session.statut, a.nb_soumises])).toEqual([
      ['pretest', 'ouverte', 8], ['quiz', 'ouverte', 0], ['posttest', 'brouillon', 8], ['satisfaction', 'brouillon', 0],
    ])
  })

  it('résultats en direct ; à la fermeture, les tentatives commencées sont closes en l’état', async () => {
    const [robot] = await staff.groupesPour(comptes.komla)
    const d = await staff.detailGroupe(robot.groupe.id, comptes.komla)
    const quiz = d.activites[1].session.id
    const ama = (await eleves.trouverEleveParCode('AMA234'))!
    const { tentative } = await eleves.demarrerTentative(quiz, ama.id, 'fr')
    const { questions } = await eleves.chargerSession(quiz)
    await eleves.enregistrerReponse(tentative.id, questions[0].id, { choix_coches: questions[0].choix.filter((c) => c.est_correct).map((c) => c.id), temps_ms: 4000 })

    let lignes = await staff.resultatsSession(quiz)
    expect(lignes).toHaveLength(11)
    expect(lignes[0].eleve.prenom).toBe('Ama')
    expect(lignes[0].tentative?.statut).toBe('en_cours')

    await staff.changerStatutSession(quiz, 'fermee', comptes.komla)
    lignes = await staff.resultatsSession(quiz)
    expect(lignes[0].tentative).toMatchObject({ statut: 'expiree', score: 1, score_max: 4, temps_total_ms: 4000 })
    // l'élève ne peut plus reprendre
    await expect(eleves.demarrerTentative(quiz, ama.id, 'fr')).rejects.toMatchObject({ code: 'session_fermee' })
  })
})

describe('espace personnel : banque de fiches et validation', () => {
  const brouillon = (titre: string) => ({
    fiche: {
      id: crypto.randomUUID(), titre_fr: titre, type: 'quiz' as const, mode_correction: 'ia_definitive' as const,
      visibilite: 'privee' as const, statut_validation: 'brouillon' as const, auteur_id: '', version: 1,
    },
    questions: [{
      id: crypto.randomUUID(), type: 'qcm_unique' as const, enonce_fr: 'Question ?', duree_secondes: 20, points: 1,
      mode_bareme: 'tout_ou_rien' as const,
      choix: [
        { id: crypto.randomUUID(), question_id: '', texte_fr: 'Oui', est_correct: true, ordre: 0 },
        { id: crypto.randomUUID(), question_id: '', texte_fr: 'Non', est_correct: false, ordre: 1 },
      ],
    }],
  })

  it('une fiche privée n’est visible que de son auteur ; l’admin voit les fiches soumises', async () => {
    const titres = async (p: Personnel) => (await staff.fichesVisibles(p)).map((f) => f.fiche.titre_fr)
    expect(await titres(comptes.komla)).not.toContain('Quiz : la sécurité au fab lab')
    expect(await titres(comptes.akossiwa)).toContain('Quiz : la sécurité au fab lab')
    expect(await titres(comptes.edem)).toContain('Quiz : la sécurité au fab lab')
  })

  it('cycle complet : brouillon → soumise → refusée → corrigée → validée et officielle', async () => {
    const f = brouillon('Quiz moteurs')
    const id = await staff.enregistrerFiche(f, comptes.komla)
    expect((await db.fiche.get(id))?.auteur_id).toBe(comptes.komla.id)

    await staff.soumettreFiche(id, comptes.komla)
    await expect(staff.validerFiche(id, comptes.akossiwa)).rejects.toBeInstanceOf(ErreurDroits) // un formateur ne valide pas
    await expect(staff.refuserFiche(id, '  ', comptes.edem)).rejects.toBeInstanceOf(ErreurDroits) // un refus doit être expliqué
    await staff.refuserFiche(id, 'Ajoute une image à la question 1', comptes.edem)
    expect(await db.fiche.get(id)).toMatchObject({ statut_validation: 'refusee', commentaire_validation: 'Ajoute une image à la question 1' })

    await staff.enregistrerFiche({ ...f, fiche: { ...f.fiche, titre_fr: 'Quiz moteurs v2' } }, comptes.komla)
    expect((await db.fiche.get(id))?.statut_validation).toBe('brouillon') // corrigée : repasse en brouillon
    await staff.soumettreFiche(id, comptes.komla)
    await staff.validerFiche(id, comptes.edem)
    expect(await db.fiche.get(id)).toMatchObject({ statut_validation: 'validee', visibilite: 'officielle', validee_par: comptes.edem.id })
    // une fois validée, l'auteur ne la modifie plus
    await expect(staff.enregistrerFiche(f, comptes.komla)).rejects.toBeInstanceOf(ErreurDroits)
  })

  it('on ne programme que des fiches validées ou les siennes', async () => {
    const [robot] = await staff.groupesPour(comptes.komla)
    const securite = (await staff.fichesVisibles(comptes.akossiwa)).find((f) => f.fiche.titre_fr.startsWith('Quiz : la sécurité'))!
    // Komla ne peut pas programmer la fiche non validée d'Akossiwa…
    await expect(staff.ajouterActivite(robot.groupe.id, securite.fiche.id, comptes.komla)).rejects.toBeInstanceOf(ErreurDroits)
    // …mais Akossiwa peut l'essayer dans un groupe où elle intervient
    await staff.ajouterActivite(robot.groupe.id, securite.fiche.id, comptes.akossiwa)
    const d = await staff.detailGroupe(robot.groupe.id, comptes.komla)
    expect(d.activites.find((a) => a.fiche.id === securite.fiche.id)?.session.statut).toBe('brouillon')
  })

  it('une fiche déjà passée par des élèves ne se modifie plus : on la duplique', async () => {
    const pre = (await staff.fichesVisibles(comptes.komla)).find((f) => f.fiche.titre_fr === 'Prétest — Mon premier robot')!
    const contenu = await staff.chargerFiche(pre.fiche.id)
    await expect(staff.enregistrerFiche(contenu, comptes.komla)).rejects.toBeInstanceOf(ErreurDroits)
    const copie = await staff.dupliquerFiche(pre.fiche.id, comptes.komla)
    const c = await staff.chargerFiche(copie)
    expect(c.fiche).toMatchObject({ titre_fr: 'Prétest — Mon premier robot (copie)', statut_validation: 'brouillon', visibilite: 'privee', auteur_id: comptes.komla.id })
    expect(c.questions).toHaveLength(contenu.questions.length)
    expect(c.questions[0].id).not.toBe(contenu.questions[0].id) // questions copiées, pas partagées
    expect(c.questions[1].choix.filter((x) => x.est_correct)).toHaveLength(3)
  })
})
