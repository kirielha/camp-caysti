// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { FournisseurContexte } from '../contexte'
import { db, repo } from '../data'
import { reinitialiserDemo } from '../data/seed'

beforeEach(async () => {
  sessionStorage.clear()
  window.location.hash = '#/formateur'
  await reinitialiserDemo(db)
})
afterEach(cleanup)

const monter = () => render(<FournisseurContexte><App /></FournisseurContexte>)

describe('espace formateur', () => {
  it('une formatrice démarre son atelier, ouvre une activité, et l’élève peut commencer', async () => {
    const u = userEvent.setup()
    monter()
    await u.click(await screen.findByRole('button', { name: /Akossiwa Dzifa/ }))

    // ses deux groupes, dans l'ordre de la journée
    await screen.findByRole('heading', { name: 'Mes groupes' })
    const liens = await screen.findAllByRole('link', { name: /Mon premier robot|Imprimer en 3D/ })
    expect(liens.map((l) => l.querySelector('.carte-groupe-titre')?.textContent)).toEqual(['Mon premier robot', 'Imprimer en 3D'])
    await u.click(liens[1])

    // l'atelier est à venir : démarrage avec confirmation
    await screen.findByRole('heading', { name: 'Imprimer en 3D' })
    expect(screen.getByText('Atelier à venir')).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Démarrer l’atelier' }))
    await u.click(screen.getByRole('button', { name: 'Confirmer le démarrage' }))
    expect(await screen.findByText('Atelier en cours')).toBeTruthy()

    // ouvrir le quiz (programmé fermé)
    const quiz = (await screen.findByRole('heading', { name: /Quiz express : la chaîne/ })).closest('li')!
    expect(within(quiz).getByText('Pas encore ouverte')).toBeTruthy()
    await u.click(within(quiz).getByRole('button', { name: 'Ouvrir' }))
    await waitFor(() => expect(within(screen.getByRole('heading', { name: /Quiz express : la chaîne/ }).closest('li')!).getByText('Ouverte')).toBeTruthy())

    // côté élève, le prétest et le quiz 3D sont maintenant accessibles
    const ama = (await repo.trouverEleveParCode('AMA234'))!
    const [, impression] = await repo.ateliersPourEleve(ama.id)
    expect(impression.groupe.statut).toBe('en_cours')
    expect((await repo.demarrerTentative(impression.activites[1].session.id, ama.id, 'fr')).tentative).toBeTruthy()
  })

  it('suivi des résultats d’une activité et projection du classement', async () => {
    const u = userEvent.setup()
    monter()
    await u.click(await screen.findByRole('button', { name: /Komla Agbeko/ }))
    await u.click((await screen.findAllByRole('link', { name: /Mon premier robot/ }))[0])
    const pre = (await screen.findByRole('heading', { name: 'Prétest — Mon premier robot' })).closest('li')!
    expect(within(pre).getByText('8/11 ont terminé')).toBeTruthy()
    await u.click(within(pre).getByRole('link', { name: 'Résultats' }))

    await screen.findByRole('heading', { name: 'Prétest — Mon premier robot' })
    const lignes = await screen.findAllByRole('row')
    expect(lignes).toHaveLength(12) // en-tête + 11 élèves
    expect(lignes[1].textContent).toContain('Fatou Camara') // meilleur score en tête
    expect(lignes[1].textContent).toContain('7/8')
    expect(screen.getAllByText('Pas commencé')).toHaveLength(3)

    await u.click(screen.getByRole('button', { name: 'Projeter le classement' }))
    expect(await screen.findByRole('heading', { name: 'Les 10 premiers' })).toBeTruthy()
    expect(document.querySelectorAll('.projection-liste .classement-ligne')).toHaveLength(8)
  })

  it('un admin voit les fiches à valider ; un formateur n’a pas ce menu', async () => {
    const u = userEvent.setup()
    monter()
    await u.click(await screen.findByRole('button', { name: /Komla Agbeko/ }))
    await screen.findByRole('heading', { name: 'Mes groupes' })
    expect(screen.queryByRole('link', { name: /À valider/ })).toBeNull()
    await u.click(screen.getByRole('button', { name: 'Se déconnecter' }))

    await u.click(await screen.findByRole('button', { name: /Edem Amouzou/ }))
    await screen.findByRole('heading', { name: 'Groupes du camp' })
    const menu = await screen.findByRole('link', { name: /À valider/ })
    await waitFor(() => expect(menu.querySelector('.pastille')?.textContent).toBe('1'))
  })
})
