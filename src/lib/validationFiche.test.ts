import { describe, expect, it } from 'vitest'
import type { FicheEditable, QuestionEditable } from '../data/staffRepository'
import type { Choix } from '../types'
import { verifierFiche } from './validationFiche'

const choix = (bons: boolean[], textes = bons.map((_, i) => `R${i}`)): Choix[] =>
  bons.map((est_correct, i) => ({ id: `c${i}`, question_id: 'q', texte_fr: textes[i], est_correct, ordre: i }))

const question = (patch: Partial<QuestionEditable> = {}): QuestionEditable => ({
  id: 'q', type: 'qcm_unique', enonce_fr: 'Énoncé', duree_secondes: 30, points: 1, mode_bareme: 'tout_ou_rien',
  choix: choix([true, false]), ...patch,
})

const fiche = (questions: QuestionEditable[], patch: Partial<FicheEditable['fiche']> = {}): FicheEditable => ({
  fiche: { id: 'f', titre_fr: 'Quiz', type: 'quiz', mode_correction: 'ia_definitive', visibilite: 'privee', statut_validation: 'brouillon', auteur_id: 'a', version: 1, ...patch },
  questions,
})

const messages = (f: FicheEditable, soumission = false) => verifierFiche(f, soumission).map((p) => p.message)

describe('contrôle des fiches', () => {
  it('accepte une fiche correcte', () => {
    expect(verifierFiche(fiche([question()]))).toEqual([])
  })
  it('exige un titre et au moins une question', () => {
    expect(messages(fiche([], { titre_fr: ' ' }))).toEqual(['Donnez un titre en français à la fiche.', 'Ajoutez au moins une question.'])
  })
  it('QCM : deux réponses minimum, une bonne réponse, pas de réponse vide', () => {
    expect(messages(fiche([question({ choix: choix([false, false]) })]))).toContain('Cochez la bonne réponse.')
    expect(messages(fiche([question({ choix: choix([true]) })]))).toContain('Proposez au moins deux réponses.')
    expect(messages(fiche([question({ choix: choix([true, false], ['A', ' ']) })]))).toContain('Une réponse est vide : écrivez son texte, ajoutez une image ou supprimez-la.')
  })
  it('une réponse illustrée sans texte est acceptée', () => {
    const c = choix([true, false], ['', 'B'])
    c[0].image = 'demo/robot.svg'
    expect(verifierFiche(fiche([question({ choix: c })]))).toEqual([])
  })
  it('QCM unique : une seule bonne réponse ; QCM multiple : au moins un piège', () => {
    expect(messages(fiche([question({ choix: choix([true, true, false]) })]))[0]).toMatch(/Une seule bonne réponse/)
    expect(messages(fiche([question({ type: 'qcm_multiple', choix: choix([true, true]) })]))[0]).toMatch(/laissez au moins un piège/)
  })
  it('QRO IA : réponse attendue obligatoire ; durée bornée', () => {
    expect(messages(fiche([question({ type: 'qro_ia', choix: [] })]))).toContain('Écrivez la réponse attendue : l’IA s’en sert pour corriger.')
    expect(messages(fiche([question({ duree_secondes: 2 })]))).toContain('La durée doit être comprise entre 5 et 600 secondes.')
  })
  it('un post-test soumis doit être relié à son prétest', () => {
    const post = fiche([question()], { type: 'posttest' })
    expect(messages(post)).toEqual([]) // enregistrer un brouillon reste possible
    expect(messages(post, true)).toEqual(['Choisissez le prétest auquel ce post-test sera comparé.'])
  })
  it('une fiche d’avis ne contient pas de questions notées', () => {
    expect(messages(fiche([question()], { type: 'satisfaction' }))[0]).toMatch(/fiche d’avis/)
  })
  it('indique la question concernée', () => {
    const p = verifierFiche(fiche([question(), question({ id: 'q2', enonce_fr: '' })]))
    expect(p).toEqual([{ question: 1, message: 'Écrivez l’énoncé en français.' }])
  })
})
