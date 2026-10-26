import { describe, expect, it } from 'vitest'
import { analyserFeuille, COLONNES, genererCode, lireClasse, lireDate, lireSexe, type Referentiels } from './importEleves'

const ref: Referentiels = {
  ecoles: [{ id: 'e1', nom: 'Lycée de Tokoin' }],
  langues: [
    { id: 'fr', libelle_fr: 'Français', libelle_en: 'French', est_autre: false, ordre: 0 },
    { id: 'ewe', libelle_fr: 'Éwé', libelle_en: 'Ewe', est_autre: false, ordre: 1 },
    { id: 'autre', libelle_fr: 'Autre', libelle_en: 'Other', est_autre: true, ordre: 9 },
  ],
  eleves: [{ id: 'deja', nom: 'MENSAH', prenom: 'Ama', date_naissance: '2014-05-12' }],
  dateReference: new Date('2026-12-01T00:00:00Z'),
}

describe('lecture des valeurs saisies par les écoles', () => {
  it('classes écrites de plusieurs façons', () => {
    expect(['6ème', '6e', 'Sixième', 'CM 2', 'Terminale', 'TleD', 'Seconde', '1ère', '5eA'].map(lireClasse))
      .toEqual(['6e', '6e', '6e', 'CM2', 'Tle', 'Tle', '2nde', '1ere', '5e'])
    expect(lireClasse('Licence')).toBeUndefined()
  })
  it('sexe', () => {
    expect(['F', 'fille', 'Féminin', 'M', 'Garçon', 'G'].map(lireSexe)).toEqual(['F', 'F', 'F', 'M', 'M', 'M'])
    expect(lireSexe('X')).toBeUndefined()
  })
  it('dates : JJ/MM/AAAA, AAAA-MM-JJ, date Excel, numéro de série ; rejet des dates impossibles', () => {
    expect(lireDate('12/05/2014')).toBe('2014-05-12')
    expect(lireDate('3-1-2013')).toBe('2013-01-03')
    expect(lireDate('2013-01-03')).toBe('2013-01-03')
    expect(lireDate(new Date(Date.UTC(2012, 8, 21)))).toBe('2012-09-21')
    expect(lireDate(41904)).toBe('2014-09-22') // numéro de série Excel du 22/09/2014
    expect(lireDate('31/02/2014')).toBeUndefined()
    expect(lireDate('mai 2014')).toBeUndefined()
  })
})

describe('analyse d’une feuille d’inscription', () => {
  const ligne = (v: Partial<Record<(typeof COLONNES)[number], string | number>>) => COLONNES.map((c) => v[c] ?? null)

  it('normalise les lignes valides et reconnaît école, langue, élève déjà inscrit', () => {
    const { lignes, colonnesManquantes } = analyserFeuille([
      [...COLONNES],
      ligne({ Nom: 'Mensah', Prénom: 'Ama', 'Date de naissance': '12/05/2014', Sexe: 'Fille', Classe: 'CM2', École: 'lycee de tokoin', 'Langue parlée': 'ewe', 'Téléphone du parent': '+228 90 00 00 00' }),
      ligne({ Nom: 'Doe', Prénom: 'Kofi', 'Date de naissance': '01/03/2013', Sexe: 'M', Classe: '6ème', École: 'CEG Bè', 'Langue parlée': 'Kotokoli', 'E-mail du parent': 'parent@exemple.tg' }),
    ], ref)
    expect(colonnesManquantes).toEqual([])
    expect(lignes[0]).toMatchObject({ numero: 2, nom: 'MENSAH', classe: 'CM2', sexe: 'F', ecole_id: 'e1', langue_id: 'ewe', erreurs: [], eleve_existant_id: 'deja' })
    expect(lignes[1]).toMatchObject({ classe: '6e', ecole_id: undefined, ecole_nom: 'CEG Bè', langue_id: 'autre', langue_autre: 'Kotokoli', erreurs: [] })
    expect(lignes[1].eleve_existant_id).toBeUndefined()
  })

  it('signale chaque problème avec un message qui dit quoi corriger', () => {
    const { lignes } = analyserFeuille([
      [...COLONNES],
      ligne({ Nom: 'Lawson', Prénom: '', 'Date de naissance': '31/02/2014', Sexe: 'X', Classe: 'Licence', 'E-mail du parent': 'pas-un-mail' }),
      ligne({ Nom: 'Agbo', Prénom: 'Yao', 'Date de naissance': '01/01/1990', Sexe: 'M', Classe: '3e', 'Téléphone du parent': '90000000' }),
    ], ref)
    expect(lignes[0].erreurs).toEqual([
      'Prénom manquant',
      'Date de naissance illisible (« 31/02/2014 ») : écrivez JJ/MM/AAAA',
      'Sexe non reconnu (« X ») : écrivez F ou M',
      'Classe non reconnue (« Licence ») : de CE1 à Tle',
      'E-mail du parent invalide (« pas-un-mail »)',
    ])
    expect(lignes[1].erreurs).toEqual(['Âge improbable (36 ans) : vérifiez la date de naissance'])
  })

  it('détecte les doublons dans le fichier, ignore les lignes vides, trouve l’en-tête même décalé', () => {
    const l = ligne({ Nom: 'Etse', Prénom: 'Esi', 'Date de naissance': '30/11/2012', Sexe: 'F', Classe: '5e', 'WhatsApp du parent': '90' })
    const { lignes } = analyserFeuille([[], ['  ', null], [...COLONNES], l, [null, null], l], ref)
    expect(lignes.map((x) => x.numero)).toEqual([4, 6])
    expect(lignes[1].erreurs).toEqual(['Doublon de la ligne 4 dans le fichier'])
  })

  it('refuse une feuille sans les colonnes obligatoires', () => {
    expect(analyserFeuille([['Nom', 'Prénom', 'Âge']], ref).colonnesManquantes).toEqual(['Date de naissance', 'Sexe', 'Classe'])
  })
})

describe('codes d’accès', () => {
  it('6 caractères lisibles, uniques', () => {
    const pris = new Set(['AAAAAA'])
    const valeurs = [0, 0, 0, 0, 0, 0, 0.99, 0.5, 0.2, 0.7, 0.1, 0.3]
    let i = 0
    const code = genererCode((c) => pris.has(c), () => valeurs[i++ % valeurs.length])
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/)
    expect(code).not.toBe('AAAAAA')
  })
})
