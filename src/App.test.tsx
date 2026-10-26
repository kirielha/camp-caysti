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
    // réponses en images : une illustration par choix
    expect(document.querySelector('.choix-illustres')).toBeTruthy()
    expect(document.querySelectorAll('.choix-illustres .tuile-image')).toHaveLength(4)
    await repondre([/ultrasons/, /infrarouge/]) // 2 bonnes sur 3 → 2 points sur 3

    expect(await screen.findByText('Question 3 sur 6')).toBeTruthy()
    expect(document.querySelector('.question-illustration img')?.getAttribute('src')).toBe('demo/led.svg')
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
    expect(within(fini).getByText('5/8')).toBeTruthy()
    expect(within(fini).getByRole('link', { name: 'Voir le classement' })).toBeTruthy()
    expect(within(fini).queryByRole('link', { name: 'Commencer' })).toBeNull()
  })

  it('à la fin du temps, la question expire et passe seule à la suivante', async () => {
    const u = userEvent.setup()
    monter()
    await u.type(screen.getByLabelText(/ton code est sur ton badge/i), 'KEM789')
    await u.click(screen.getByRole('button', { name: 'Entrer' }))
    const quiz = (await screen.findByRole('heading', { name: /Quiz express : capteurs/ })).closest('li')!
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

  it('montre les deux ateliers de la journée et le classement du post-test avec la progression', async () => {
    const u = userEvent.setup()
    monter()
    await u.type(screen.getByLabelText(/ton code est sur ton badge/i), 'YAW567')
    await u.click(screen.getByRole('button', { name: 'Entrer' }))
    expect(await screen.findByText('Tu es inscrit·e à 2 ateliers.')).toBeTruthy()
    const titres = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent)
    expect(titres).toEqual(['Mon premier robot', 'Imprimer en 3D'])

    // L'atelier de l'après-midi est visible mais pas encore démarré : boutons grisés
    const impression = screen.getByRole('heading', { name: 'Imprimer en 3D' }).closest('article')!
    expect(within(impression).getByText('À venir')).toBeTruthy()
    expect(within(impression).getByText(/n’a pas encore commencé/)).toBeTruthy()
    expect(within(impression).queryAllByRole('link', { name: 'Commencer' })).toHaveLength(0)
    const boutons3d = within(impression).getAllByRole('button', { name: 'Commencer' })
    expect(boutons3d.length).toBe(4)
    expect(boutons3d.every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    expect(within(impression).getAllByText('Commence à 14 h 00').length).toBe(4)

    // Prétest robotique : tout faux en passant chaque question
    const robot = screen.getByRole('heading', { name: 'Mon premier robot' }).closest('article')!
    const pre = within(robot).getByRole('heading', { name: /Prétest/ }).closest('li')!
    await u.click(within(pre).getByRole('link', { name: 'Commencer' }))
    await u.click(await screen.findByRole('button', { name: 'Je suis prêt·e' }))
    for (let i = 1; i <= 6; i++) {
      await screen.findByText(`Question ${i} sur 6`)
      await u.click(screen.getByRole('button', { name: 'Passer' }))
    }
    await screen.findByText('Bravo, c’est envoyé !')
    await waitFor(() => expect(document.querySelectorAll('.classement-ligne').length).toBeGreaterThan(0))
    await u.click(screen.getByRole('link', { name: 'Retour à mes activités' }))

    // Post-test robotique : grisé tant que le formateur ne l'a pas ouvert
    const robot2 = (await screen.findByRole('heading', { name: 'Mon premier robot' })).closest('article')!
    let post = within(robot2).getByRole('heading', { name: /Post-test/ }).closest('li')!
    expect(within(post).getByText('Pas encore ouvert')).toBeTruthy()
    expect((within(post).getByRole('button', { name: 'Commencer' }) as HTMLButtonElement).disabled).toBe(true)
    await u.click(within(robot2).getByRole('button', { name: 'Ouvrir « Post-test »' }))
    const lignePost = () => within(screen.getByRole('heading', { name: 'Mon premier robot' }).closest('article')!).getByRole('heading', { name: /Post-test/ }).closest('li')!
    await waitFor(() => expect(within(lignePost()).queryByText('Pas encore ouvert')).toBeNull())
    post = lignePost()
    await u.click(within(post).getByRole('link', { name: 'Commencer' }))
    await u.click(await screen.findByRole('button', { name: 'Je suis prêt·e' }))
    await screen.findByText('Question 1 sur 5')
    const bonne = screen.getAllByRole('radio').find((r) => /informations sur ce qui l’entoure/.test(r.textContent ?? ''))!
    await u.click(bonne)
    await u.click(screen.getByRole('button', { name: 'Valider' }))
    for (let i = 2; i <= 5; i++) {
      await screen.findByText(`Question ${i} sur 5`)
      await u.click(screen.getByRole('button', { name: 'Passer' }))
    }

    // Résultat du post-test : progression et classement du post-test
    expect(await screen.findByText(/\+1 point depuis le prétest/)).toBeTruthy()
    await waitFor(() => expect(document.querySelectorAll('.classement-ligne')).toHaveLength(9))
    expect(document.querySelector('.classement-moi')?.textContent).toContain('Yaw A.')

    // Accueil : le bandeau de progression de l'atelier apparaît
    await u.click(screen.getByRole('link', { name: 'Retour à mes activités' }))
    const bandeau = await screen.findByText('+1 pts')
    expect(bandeau.closest('.progression')?.textContent).toContain('Prétest 0/8')
  })

  it('bascule l’interface en anglais', async () => {
    const u = userEvent.setup()
    monter()
    await u.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeTruthy()
  })
})
