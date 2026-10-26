// Analyse d'un fichier Excel d'inscription d'élèves.
// Fonction pure (sans base ni navigateur) : elle reçoit les lignes brutes du tableur
// et les référentiels, et renvoie chaque ligne normalisée avec ses erreurs.
// Les écoles qui envoient des listes écrivent « 6ème », « Terminale », « Fille »,
// « 12/05/2014 »… : on accepte ces variantes plutôt que de rejeter la ligne.

import type { Classe, Ecole, Eleve, LangueParlee } from '../types'

/** Colonnes du modèle, dans l'ordre. Les en-têtes sont reconnus sans tenir compte des accents ni de la casse. */
export const COLONNES = [
  'Nom', 'Prénom', 'Date de naissance', 'Sexe', 'Classe', 'École', 'Langue parlée',
  'Nom du parent', 'Téléphone du parent', 'WhatsApp du parent', 'E-mail du parent', 'Lien de parenté',
] as const

type Colonne = (typeof COLONNES)[number]
type Cellule = string | number | boolean | Date | null | undefined

export interface LigneImport {
  /** Numéro de la ligne dans le fichier (en-tête = 1). */
  numero: number
  nom: string
  prenom: string
  date_naissance?: string
  sexe?: 'F' | 'M'
  classe?: Classe
  ecole_nom?: string
  /** École reconnue dans la liste existante ; sinon elle sera créée. */
  ecole_id?: string
  langue_id?: string
  langue_autre?: string
  tuteur: { nom?: string; telephone?: string; whatsapp?: string; email?: string; lien?: string }
  erreurs: string[]
  /** Élève déjà connu (même nom, prénom et date de naissance) : il sera rattaché, pas recréé. */
  eleve_existant_id?: string
}

export const normaliser = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const texte = (c: Cellule) => (c === null || c === undefined ? '' : c instanceof Date ? '' : String(c).trim())

const CLASSES: Record<string, Classe> = {
  ce1: 'CE1', ce2: 'CE2', cm1: 'CM1', cm2: 'CM2',
  '6': '6e', '6e': '6e', '6eme': '6e', sixieme: '6e',
  '5': '5e', '5e': '5e', '5eme': '5e', cinquieme: '5e',
  '4': '4e', '4e': '4e', '4eme': '4e', quatrieme: '4e',
  '3': '3e', '3e': '3e', '3eme': '3e', troisieme: '3e',
  '2nde': '2nde', '2nd': '2nde', seconde: '2nde', '2de': '2nde',
  '1ere': '1ere', '1re': '1ere', premiere: '1ere', '1': '1ere',
  tle: 'Tle', terminale: 'Tle', term: 'Tle', t: 'Tle',
}

export function lireClasse(v: string): Classe | undefined {
  const n = normaliser(v).replace(/\s+/g, '')
  return CLASSES[n] ?? CLASSES[n.replace(/[a-d]$/, '')] // « 6eA », « TleD » : on ignore la lettre de section
}

export function lireSexe(v: string): 'F' | 'M' | undefined {
  const n = normaliser(v)
  if (['f', 'fille', 'feminin', 'femme'].includes(n)) return 'F'
  if (['m', 'g', 'garcon', 'masculin', 'homme'].includes(n)) return 'M'
  return undefined
}

/** Date de naissance en ISO (AAAA-MM-JJ). Accepte une date Excel, JJ/MM/AAAA, JJ-MM-AAAA, AAAA-MM-JJ. */
export function lireDate(c: Cellule): string | undefined {
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? undefined : c.toISOString().slice(0, 10)
  if (typeof c === 'number') {
    // numéro de série Excel (jours depuis le 30/12/1899)
    if (c < 1000 || c > 80000) return undefined
    return new Date(Math.round((c - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
  }
  const s = texte(c)
  const fr = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const parties = fr ? [+fr[3], +fr[2], +fr[1]] : iso ? [+iso[1], +iso[2], +iso[3]] : undefined
  if (!parties) return undefined
  const [annee, mois, jour] = parties
  const d = new Date(Date.UTC(annee, mois - 1, jour))
  // le 31/02 ne doit pas devenir silencieusement le 03/03
  if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) return undefined
  return d.toISOString().slice(0, 10)
}

const ageAu = (iso: string, reference: Date) => {
  const n = new Date(`${iso}T00:00:00Z`)
  let age = reference.getUTCFullYear() - n.getUTCFullYear()
  const avant = reference.getUTCMonth() < n.getUTCMonth() || (reference.getUTCMonth() === n.getUTCMonth() && reference.getUTCDate() < n.getUTCDate())
  if (avant) age--
  return age
}

export interface Referentiels {
  ecoles: Ecole[]
  langues: LangueParlee[]
  eleves: Pick<Eleve, 'id' | 'nom' | 'prenom' | 'date_naissance'>[]
  /** Date du camp, pour vérifier que l'âge est plausible. */
  dateReference?: Date
}

export interface ResultatAnalyse {
  lignes: LigneImport[]
  /** Colonnes obligatoires absentes de l'en-tête. */
  colonnesManquantes: Colonne[]
}

const OBLIGATOIRES: Colonne[] = ['Nom', 'Prénom', 'Date de naissance', 'Sexe', 'Classe']

export function analyserFeuille(lignes: Cellule[][], ref: Referentiels): ResultatAnalyse {
  // L'en-tête est la première ligne non vide
  const iEntete = lignes.findIndex((l) => l.some((c) => texte(c)))
  if (iEntete === -1) return { lignes: [], colonnesManquantes: [...OBLIGATOIRES] }
  const entete = lignes[iEntete].map((c) => normaliser(texte(c)))
  const position = (col: Colonne) => entete.indexOf(normaliser(col))
  const colonnesManquantes = OBLIGATOIRES.filter((c) => position(c) === -1)
  if (colonnesManquantes.length) return { lignes: [], colonnesManquantes }

  const val = (l: Cellule[], col: Colonne) => (position(col) === -1 ? undefined : l[position(col)])
  const ecolesParNom = new Map(ref.ecoles.map((e) => [normaliser(e.nom), e]))
  const autre = ref.langues.find((l) => l.est_autre)
  const reference = ref.dateReference ?? new Date()
  const cle = (nom: string, prenom: string, date?: string) => `${normaliser(nom)}|${normaliser(prenom)}|${date ?? ''}`
  const existants = new Map(ref.eleves.map((e) => [cle(e.nom, e.prenom, e.date_naissance), e.id]))
  const vus = new Map<string, number>()

  const resultat: LigneImport[] = []
  lignes.slice(iEntete + 1).forEach((l, i) => {
    if (!l.some((c) => texte(c) || c instanceof Date)) return // ligne vide
    const numero = iEntete + i + 2
    const erreurs: string[] = []
    const nom = texte(val(l, 'Nom')).toUpperCase()
    const prenom = texte(val(l, 'Prénom')).replace(/\s+/g, ' ')
    if (!nom) erreurs.push('Nom manquant')
    if (!prenom) erreurs.push('Prénom manquant')

    const brutDate = val(l, 'Date de naissance')
    const date_naissance = lireDate(brutDate ?? null)
    if (!date_naissance) erreurs.push(texte(brutDate) ? `Date de naissance illisible (« ${texte(brutDate)} ») : écrivez JJ/MM/AAAA` : 'Date de naissance manquante')
    else {
      const age = ageAu(date_naissance, reference)
      if (age < 5 || age > 20) erreurs.push(`Âge improbable (${age} ans) : vérifiez la date de naissance`)
    }

    const brutSexe = texte(val(l, 'Sexe'))
    const sexe = lireSexe(brutSexe)
    if (!sexe) erreurs.push(brutSexe ? `Sexe non reconnu (« ${brutSexe} ») : écrivez F ou M` : 'Sexe manquant')

    const brutClasse = texte(val(l, 'Classe'))
    const classe = lireClasse(brutClasse)
    if (!classe) erreurs.push(brutClasse ? `Classe non reconnue (« ${brutClasse} ») : de CE1 à Tle` : 'Classe manquante')

    const ecole_nom = texte(val(l, 'École')) || undefined
    const ecole_id = ecole_nom ? ecolesParNom.get(normaliser(ecole_nom))?.id : undefined

    const brutLangue = texte(val(l, 'Langue parlée'))
    let langue_id: string | undefined
    let langue_autre: string | undefined
    if (brutLangue) {
      const trouvee = ref.langues.find((x) => !x.est_autre && (normaliser(x.libelle_fr) === normaliser(brutLangue) || normaliser(x.libelle_en) === normaliser(brutLangue)))
      if (trouvee) langue_id = trouvee.id
      else { langue_id = autre?.id; langue_autre = brutLangue }
    }

    const tuteur = {
      nom: texte(val(l, 'Nom du parent')) || undefined,
      telephone: texte(val(l, 'Téléphone du parent')) || undefined,
      whatsapp: texte(val(l, 'WhatsApp du parent')) || undefined,
      email: texte(val(l, 'E-mail du parent')) || undefined,
      lien: texte(val(l, 'Lien de parenté')) || undefined,
    }
    if (!tuteur.telephone && !tuteur.whatsapp && !tuteur.email) erreurs.push('Aucun contact du parent (téléphone, WhatsApp ou e-mail)')
    if (tuteur.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tuteur.email)) erreurs.push(`E-mail du parent invalide (« ${tuteur.email} »)`)

    const k = cle(nom, prenom, date_naissance)
    if (nom && prenom && date_naissance) {
      if (vus.has(k)) erreurs.push(`Doublon de la ligne ${vus.get(k)} dans le fichier`)
      else vus.set(k, numero)
    }

    resultat.push({
      numero, nom, prenom, date_naissance, sexe, classe, ecole_nom, ecole_id, langue_id, langue_autre, tuteur, erreurs,
      eleve_existant_id: existants.get(k),
    })
  })
  return { lignes: resultat, colonnesManquantes }
}

/** Code d'accès : 6 caractères sans 0/O ni 1/I/L, pour être lu sans erreur sur un badge. */
export function genererCode(existe: (code: string) => boolean, aleatoire = Math.random): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  for (;;) {
    let code = ''
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(aleatoire() * alphabet.length)]
    if (!existe(code)) return code
  }
}
