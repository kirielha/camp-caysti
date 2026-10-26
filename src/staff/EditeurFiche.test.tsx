// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { FournisseurContexte } from '../contexte'
import { db } from '../data'
import { reinitialiserDemo } from '../data/seed'

beforeEach(async () => {
  sessionStorage.clear()
  window.location.hash = '#/formateur'
  await reinitialiserDemo(db)
})
afterEach(cleanup)

const monter = () => render(<FournisseurContexte><App /></FournisseurContexte>)

describe('éditeur de fiches', () => {
  it('un formateur crée un quiz, corrige les erreurs signalées, le soumet ; un admin le valide', async () => {
    const u = userEvent.setup()
    monter()
    await u.click(await screen.findByRole('button', { name: /Komla Agbeko/ }))
    await u.click(await screen.findByRole('link', { name: 'Fiches' }))
    await u.click(await screen.findByRole('link', { name: 'Créer une fiche' }))
    await screen.findByRole('heading', { name: 'Nouvelle fiche' })

    // enregistrer une fiche vide : les problèmes sont listés
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Donnez un titre en français à la fiche.')).toBeTruthy()
    expect(screen.getByText('Ajoutez au moins une question.')).toBeTruthy()

    await u.type(screen.getByLabelText('Titre (français)'), 'Quiz : les moteurs')
    await u.selectOptions(screen.getByLabelText('Type de fiche'), 'quiz')
    const techno = screen.getByLabelText('Technologie') as HTMLSelectElement
    await u.selectOptions(techno, within(techno).getByRole('option', { name: 'Robotique' }))

    await u.click(screen.getByRole('button', { name: '+ Ajouter une question' }))
    const carte = screen.getByText('Question 1').closest('li')!
    await u.type(within(carte).getByLabelText('Énoncé (français)'), 'Quel composant fait tourner une roue ?')
    await u.type(within(carte).getByLabelText('Réponse A en français'), 'Le moteur')
    await u.type(within(carte).getByLabelText('Réponse B en français'), 'La LED')

    // réponse C vide et aucune bonne réponse cochée
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await within(carte).findByText('Cochez la bonne réponse.')).toBeTruthy()
    expect(within(carte).getByText(/Une réponse est vide/)).toBeTruthy()

    await u.click(within(carte).getByRole('button', { name: 'Supprimer la réponse C' }))
    await u.click(within(carte).getByLabelText('Réponse A correcte'))
    // illustration choisie dans la galerie
    await u.click(within(carte).getByRole('button', { name: 'Choisir une illustration' }))
    await u.click(within(carte).getByRole('option', { name: 'moteur' }))
    expect(within(carte).getByAltText('Image de la question').getAttribute('src')).toBe('demo/moteur.svg')

    await u.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Fiche enregistrée.')).toBeTruthy()
    expect(screen.getByText('Brouillon')).toBeTruthy()

    await u.click(screen.getByRole('button', { name: 'Soumettre à validation' }))
    expect(await screen.findByText('Fiche soumise. Un admin va la relire.')).toBeTruthy()
    expect(screen.getByText('En attente de validation')).toBeTruthy()
    const enBase = (await db.fiche.toArray()).find((f) => f.titre_fr === 'Quiz : les moteurs')!
    expect(enBase.statut_validation).toBe('soumise')

    // l'admin du camp la retrouve dans « À valider » et la valide
    await u.click(screen.getByRole('button', { name: 'Se déconnecter' }))
    await u.click(await screen.findByRole('button', { name: /Edem Amouzou/ }))
    await u.click(await screen.findByRole('link', { name: /À valider/ }))
    await u.click(await screen.findByRole('link', { name: /Quiz : les moteurs/ }))
    await u.click(await screen.findByRole('button', { name: 'Valider et rendre officielle' }))
    expect(await screen.findByText('Fiche validée : elle est maintenant officielle.')).toBeTruthy()
    await waitFor(async () => expect((await db.fiche.get(enBase.id))?.visibilite).toBe('officielle'))
    const choixEnBase = await db.choix.where('question_id').equals((await db.fiche_question.where('fiche_id').equals(enBase.id).first())!.question_id).toArray()
    expect(choixEnBase.sort((a, b) => a.ordre - b.ordre).map((c) => [c.texte_fr, c.est_correct])).toEqual([['Le moteur', true], ['La LED', false]])
  })

  it('une fiche officielle s’ouvre en lecture seule avec la possibilité de la dupliquer', async () => {
    const u = userEvent.setup()
    monter()
    await u.click(await screen.findByRole('button', { name: /Komla Agbeko/ }))
    await u.click(await screen.findByRole('link', { name: 'Fiches' }))
    await u.click(await screen.findByRole('link', { name: 'Prétest — Mon premier robot' }))
    expect(await screen.findByText(/Cette fiche est officielle/)).toBeTruthy()
    expect(screen.getByLabelText('Titre (français)').matches(':disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    await u.click(screen.getByRole('button', { name: 'Dupliquer la fiche' }))
    expect(await screen.findByRole('heading', { name: 'Prétest — Mon premier robot (copie)' })).toBeTruthy()
    expect(screen.getByLabelText('Titre (français)').matches(':disabled')).toBe(false)
  })
})
