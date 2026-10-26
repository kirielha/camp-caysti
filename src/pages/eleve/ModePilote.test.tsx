// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../../App'
import { FournisseurContexte } from '../../contexte'
import { db, repo, staff } from '../../data'
import { reinitialiserDemo } from '../../data/seed'
import type { Personnel } from '../../types'

let komla: Personnel
let quiz: string

beforeEach(async () => {
  sessionStorage.clear()
  window.location.hash = ''
  await reinitialiserDemo(db)
  komla = (await staff.comptesDemo()).find((p) => p.prenom === 'Komla')!
  const [robot] = await staff.groupesPour(komla)
  quiz = (await staff.detailGroupe(robot.groupe.id, komla)).activites.find((a) => a.fiche.type === 'quiz')!.session.id
  await staff.changerModeSession(quiz, 'pilote', komla)
})
afterEach(cleanup)

const monter = () => render(<FournisseurContexte><App /></FournisseurContexte>)

describe('mode piloté : écran élève', () => {
  it('l’écran de l’élève suit les commandes du formateur, question par question', async () => {
    const u = userEvent.setup()
    monter()
    await u.type(screen.getByLabelText(/ton code est sur ton badge/i), 'AMA234')
    await u.click(screen.getByRole('button', { name: 'Entrer' }))

    const ligne = (await screen.findByRole('heading', { name: /Quiz express : capteurs/ })).closest('li')!
    expect(within(ligne).getByText('En direct')).toBeTruthy()
    await u.click(within(ligne).getByRole('link', { name: 'Rejoindre' }))

    // salle d'attente
    expect(await screen.findByRole('heading', { name: 'Tu es dans la salle !' })).toBeTruthy()
    expect(screen.getByText('1 camarade connecté')).toBeTruthy()

    // le formateur lance la question 1 : elle apparaît sans action de l'élève
    await staff.piloter(quiz, 'suivante', komla)
    expect(await screen.findByText('Question 1 sur 3')).toBeTruthy()
    const bonne = screen.getAllByRole('radio').find((r) => /une distance/.test(r.textContent ?? ''))!
    await u.click(bonne)
    await u.click(screen.getByRole('button', { name: 'Valider' }))
    expect(await screen.findByText('Réponse envoyée ! Attends la suite.')).toBeTruthy()

    // révélation : verdict personnel
    await staff.piloter(quiz, 'reveler', komla)
    expect(await screen.findByText('Bonne réponse !')).toBeTruthy()
    expect(screen.getByText('+1 pt')).toBeTruthy()

    // classement intermédiaire
    await staff.piloter(quiz, 'classement', komla)
    expect(await screen.findByText('Tu es 1er')).toBeTruthy()
    expect(document.querySelector('.classement-moi')?.textContent).toContain('Ama M.')

    // question 2 sans réponse, révélation : « pas répondu » et la bonne réponse affichée
    await staff.piloter(quiz, 'suivante', komla)
    expect(await screen.findByText('Question 2 sur 3')).toBeTruthy()
    await staff.piloter(quiz, 'reveler', komla)
    expect(await screen.findByText('Tu n’as pas répondu à temps.')).toBeTruthy()
    expect(screen.getByText('La bonne réponse : Un servomoteur')).toBeTruthy()

    // fin de partie : l'élève arrive sur son résultat
    await staff.piloter(quiz, 'terminer', komla)
    expect(await screen.findByText('Bravo, c’est envoyé !')).toBeTruthy()
    await waitFor(() => expect(document.querySelector('.score-valeur')?.textContent).toBe('1'))
    expect(screen.getByText('sur 4')).toBeTruthy()
  })
})

describe('mode piloté : écran du formateur', () => {
  it('salle d’attente, réponses reçues en direct, répartition et podium', async () => {
    const u = userEvent.setup()
    window.location.hash = '#/formateur'
    monter()
    await u.click(await screen.findByRole('button', { name: /Komla Agbeko/ }))
    await u.click((await screen.findAllByRole('link', { name: /Mon premier robot/ }))[0])
    const ligne = (await screen.findByRole('heading', { name: /Quiz express : capteurs/ })).closest('li')!
    expect((within(ligne).getByLabelText('Déroulement') as HTMLSelectElement).value).toBe('pilote')
    await u.click(within(ligne).getByRole('link', { name: 'Animer en direct' }))

    // deux élèves entrent dans la salle
    await screen.findByText(/élèves? dans la salle/)
    const ama = (await repo.trouverEleveParCode('AMA234'))!
    const yaw = (await repo.trouverEleveParCode('YAW567'))!
    const tAma = await repo.rejoindreSessionPilotee(quiz, ama.id, 'fr')
    const tYaw = await repo.rejoindreSessionPilotee(quiz, yaw.id, 'fr')
    await waitFor(() => expect(document.querySelector('.animation-noms')?.textContent).toContain('Yaw A.'))
    await waitFor(() => expect(document.querySelector('.animation-connectes')?.textContent).toBe('2/11 connectés'))

    await u.click(screen.getByRole('button', { name: 'Lancer la première question' }))
    expect(await screen.findByText('Un capteur à ultrasons mesure…')).toBeTruthy()

    // les réponses arrivent : le compteur bouge
    const { questions } = await repo.etatPilote(quiz)
    const juste = questions[0].choix.find((c) => c.est_correct)!.id
    const faux = questions[0].choix.find((c) => !c.est_correct)!.id
    await repo.repondrePilote(tAma.id, questions[0].id, { choix_coches: [juste] })
    await repo.repondrePilote(tYaw.id, questions[0].id, { choix_coches: [faux] })
    await waitFor(() => expect(document.querySelector('.animation-reponses')?.textContent).toBe('2/2 réponses'))

    await u.click(screen.getByRole('button', { name: 'Révéler la réponse maintenant' }))
    expect(await screen.findByText('1 élève(s) sur 2 ont trouvé la bonne réponse.')).toBeTruthy()
    const bon = document.querySelector('.choix-projete-bon')!
    expect(bon.textContent).toContain('une distance')
    expect(bon.querySelector('.choix-projete-compte')?.textContent).toBe('1')

    await u.click(screen.getByRole('button', { name: 'Afficher le classement' }))
    expect(await screen.findByRole('heading', { name: 'Classement' })).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Question suivante' }))
    await screen.findByText('Question 2 sur 3')
    await u.click(screen.getByRole('button', { name: 'Révéler la réponse maintenant' }))
    await u.click(await screen.findByRole('button', { name: 'Question suivante' }))
    await screen.findByText('Question 3 sur 3')
    await u.click(screen.getByRole('button', { name: 'Révéler la réponse maintenant' }))
    await u.click(await screen.findByRole('button', { name: 'Terminer et voir le classement final' }))

    expect(await screen.findByRole('heading', { name: 'Classement final' })).toBeTruthy()
    await waitFor(() => expect(document.querySelector('.podium-marche-1')?.textContent).toContain('Ama M.'))
    expect((await db.session_evaluation.get(quiz))).toMatchObject({ etape: 'terminee', statut: 'fermee' })
  })
})
