// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import writeXlsxFile from 'write-excel-file/node'
import App from '../App'
import { FournisseurContexte } from '../contexte'
import { db } from '../data'
import { reinitialiserDemo } from '../data/seed'
import { COLONNES } from '../lib/importEleves'

beforeEach(async () => {
  sessionStorage.clear()
  window.location.hash = '#/formateur'
  await reinitialiserDemo(db)
})
afterEach(cleanup)

const monter = () => render(<FournisseurContexte><App /></FournisseurContexte>)

async function fichierExcel(lignes: string[][]): Promise<File> {
  const tampon = await writeXlsxFile([[...COLONNES].map((value) => ({ value })), ...lignes.map((l) => l.map((value) => ({ value })))]).toBuffer()
  return new File([new Uint8Array(tampon)], 'liste-ecole.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

describe('gestion du camp', () => {
  it('import d’un fichier Excel : aperçu, erreurs, inscription aux groupes, codes générés', async () => {
    const u = userEvent.setup()
    monter()
    await u.click(await screen.findByRole('button', { name: /Edem Amouzou/ }))
    await u.click(await screen.findByRole('link', { name: 'Camp et élèves' }))
    await u.click(await screen.findByRole('tab', { name: 'Importer un fichier Excel' }))

    const fichier = await fichierExcel([
      ['Kodjo', 'Elom', '05/06/2013', 'Garçon', '6ème', 'EPP Agoè', 'Éwé', 'Mme Kodjo', '+228 90 00 00 09', '', '', 'mère'],
      ['Mensah', 'Ama', '12/05/2014', 'F', 'CM2', 'Lycée de Tokoin', '', '', '90', '', '', ''],
      ['Lawson', '', '01/01/2013', 'X', '5e', '', '', '', '91', '', '', ''],
    ])
    const champ = document.querySelector('input[type="file"]') as HTMLInputElement
    await u.upload(champ, fichier)

    // aperçu : 1 nouveau, 1 déjà connu, 1 à corriger
    expect(await screen.findByText('Nouveaux élèves')).toBeTruthy()
    const chiffres = [...document.querySelectorAll('.chiffres dd')].map((d) => d.textContent)
    expect(chiffres).toEqual(['3', '1', '1', '1'])
    expect(screen.getByText('Prénom manquant')).toBeTruthy()
    expect(screen.getByText('Sexe non reconnu (« X ») : écrivez F ou M')).toBeTruthy()
    expect(screen.getByText('Déjà connu : rattaché')).toBeTruthy()

    await u.click(screen.getByLabelText(/Imprimer en 3D, Groupe B/))
    await u.click(screen.getByRole('button', { name: 'Importer 2 élèves' }))
    expect(await screen.findByRole('heading', { name: 'Import terminé' })).toBeTruthy()
    const ligneElom = screen.getByText('Elom KODJO').closest('tr')!
    const code = within(ligneElom).getByText(/^[A-Z2-9]{6}$/).textContent!

    // la liste des élèves contient le nouvel élève, inscrit en 3D
    await u.click(screen.getByRole('button', { name: 'Voir la liste des élèves' }))
    const ligne = (await screen.findByText('Elom KODJO')).closest('tr')!
    expect(ligne.textContent).toContain(code)
    expect(ligne.textContent).toContain('Imprimer en 3D, Groupe B')
    expect(ligne.textContent).toContain('EPP Agoè')
  })
})
