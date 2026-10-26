// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { FournisseurContexte } from './contexte'
import { db } from './data'
import { reinitialiserDemo } from './data/seed'

beforeEach(async () => {
  sessionStorage.clear()
  window.location.hash = ''
  await reinitialiserDemo(db)
})
afterEach(cleanup)

const monter = () => render(<FournisseurContexte><App /></FournisseurContexte>)

describe('parcours élève complet dans l’interface', () => {
  it('refuse un code inconnu avec un message clair', async () => {
    const u = userEvent.setup()
    monter()
    await u.type(screen.getByLabelText(/ton code est sur ton badge/i), 'ZZZ999')
    await u.click(screen.getByRole('button', { name: 'Entrer' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/aucun élève/i)
  })

  it('code → activités → prétest → score et top 10', async () => {
    const u = userEvent.setup()
    monter()

    await u.type(screen.getByLabelText(/ton code est sur ton badge/i), 'ama234')
    await u.click(screen.getByRole('button', { name: 'Entrer' }))
    expect(await screen.findByRole('heading', { name: 'Bonjour Ama !' })).toBeTruthy()

    const prétest = (await screen.findByRole('heading', { name: /Prétest — Mon premier robot/ })).closest('li')!
    await u.click(within(prétest).getByRole('link', { name: 'Commencer' }))
    await u.click(await screen.findByRole('button', { name: 'Je suis prêt·e' }))

    const repondre = async (choix: RegExp[]) => {
      for (const c of choix) {
        const tuile = [...screen.queryAllByRole('radio'), ...screen.queryAllByRole('checkbox')].find((el) => c.test(el.textContent ?? ''))
        if (!tuile) throw new Error(`Choix introuvable : ${c}`)
        await u.click(tuile)
      }
      await u.click(screen.getByRole('button', { name: 'Valider' }))
    }

    expect(await screen.findByText('Question 1 sur 6')).toBeTruthy()
    expect(screen.getByRole('timer')?.textContent).toContain('30 s')
    await repondre([/mesurer quelque chose/])

    expect(await screen.findByText('Question 2 sur 6')).toBeTruthy()
    expect(screen.getByText('Plusieurs réponses possibles')).toBeTruthy()
    await repondre([/ultrasons/, /infrarouge/]) // 2 bonnes sur 3 → 2 points sur 3

    expect(await screen.findByText('Question 3 sur 6')).toBeTruthy()
    expect(document.querySelector('.question-image')).toBeTruthy()
    await repondre([/Une LED/])

    expect(await screen.findByText('Question 4 sur 6')).toBeTruthy()
    await repondre([/d’un moteur/])

    expect(await screen.findByText('Question 5 sur 6')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Valider' })).toHaveProperty('disabled', true)
    await u.type(screen.getByRole('textbox'), 'Une machine programmable avec des capteurs')
    await u.click(screen.getByRole('button', { name: 'Valider' }))

    expect(await screen.findByText('Question 6 sur 6')).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Passer' }))

    // Résultat : 1 + 2 + 1 + 1 = 5 sur 8, QRO IA en attente
    expect(await screen.findByText('Bravo, c’est envoyé !')).toBeTruthy()
    expect(document.querySelector('.score-valeur')?.textContent).toContain('5')
    expect(screen.getByText('sur 8')).toBeTruthy()
    expect(screen.getByText(/1 réponse écrite sera corrigée plus tard/)).toBeTruthy()

    await waitFor(() => expect(document.querySelectorAll('.classement-ligne')).toHaveLength(9))
    const moi = document.querySelector('.classement-moi')!
    expect(moi?.textContent).toContain('Ama M.')
    expect(moi.querySelector('.classement-rang')?.textContent).toContain('4') // derrière 7, 6, 6 ; devant 5

    // Retour : le prétest est marqué terminé et ne peut pas être repassé
    await u.click(screen.getByRole('link', { name: 'Retour à mes activités' }))
    const fini = (await screen.findByRole('heading', { name: /Prétest — Mon premier robot/ })).closest('li')!
    expect(within(fini).getByText('Terminé')).toBeTruthy()
    expect(within(fini).queryByRole('link', { name: 'Commencer' })).toBeNull()
  })

  it('à la fin du temps, la question expire et passe seule à la suivante', async () => {
    const u = userEvent.setup()
    monter()
    await u.type(screen.getByLabelText(/ton code est sur ton badge/i), 'KEM789')
    await u.click(screen.getByRole('button', { name: 'Entrer' }))
    const quiz = (await screen.findByRole('heading', { name: /Quiz express/ })).closest('li')!
    await u.click(within(quiz).getByRole('link', { name: 'Commencer' }))
    const pret = await screen.findByRole('button', { name: 'Je suis prêt·e' })

    // Horloge du chrono simulée (setInterval + performance.now) dès l'affichage de la question
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    await act(async () => { pret.click() })
    expect(screen.getByText('Question 1 sur 3')).toBeTruthy()
    expect(screen.getByRole('timer').textContent).toContain('15 s')
    await act(async () => { vi.advanceTimersByTime(10_000) })
    expect(screen.getByRole('timer').textContent).toContain('5 s')
    expect(document.querySelector('.chrono-urgent')).toBeTruthy() // passe au corail
    await act(async () => { vi.advanceTimersByTime(5_400) })
    vi.useRealTimers()

    expect(await screen.findByText('Temps écoulé !')).toBeTruthy()
    expect(await screen.findByText('Question 2 sur 3', {}, { timeout: 2000 })).toBeTruthy()
    // la réponse vide est enregistrée avec le temps complet de la question
    const reponses = await db.reponse.toArray()
    const derniere = reponses.find((r) => r.temps_ms === 15_000)
    expect(derniere?.choix_coches).toEqual([])
    expect(derniere?.score_final).toBe(0)
  })

  it('bascule l’interface en anglais', async () => {
    const u = userEvent.setup()
    monter()
    await u.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeTruthy()
  })
})
