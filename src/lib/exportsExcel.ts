// Fichiers Excel téléchargés depuis l'espace admin : liste des codes et résultats du camp.
import type { Cell } from 'write-excel-file/browser'
import type { Eleve, LigneExport } from '../types'

type Cellule = Cell

const entete = (titres: string[]): Cellule[] => titres.map((value) => ({ value, fontWeight: 'bold' as const }))
const nomFichier = (...morceaux: string[]) =>
  morceaux.join('-').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() + '.xlsx'

async function ecrire(feuilles: { nom: string; lignes: Cellule[][]; largeurs: number[] }[], fichier: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile(feuilles.map((f) => ({
    data: f.lignes, sheet: f.nom.slice(0, 31), columns: f.largeurs.map((width) => ({ width })), stickyRowsCount: 1,
  }))).toFile(fichier)
}

/** Liste des codes d'un groupe, à lire ou distribuer aux élèves. */
export async function telechargerCodes(eleves: Eleve[], atelier: string, groupe: string, date: string) {
  const lignes = [...eleves].sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom))
  await ecrire([{
    nom: 'Codes',
    lignes: [
      entete(['Nom', 'Prénom', 'Classe', 'Code']),
      ...lignes.map((e) => [{ value: e.nom }, { value: e.prenom }, { value: e.classe }, { value: e.code_acces, fontWeight: 'bold' as const }]),
    ],
    largeurs: [22, 18, 10, 12],
  }], nomFichier('codes', atelier, groupe, date))
}

const pct = (score?: number, max?: number) => (score === undefined || !max ? undefined : Math.round((score / max) * 1000) / 10)

export interface LigneEleve {
  date: string; atelier: string; groupe: string; partie: string; partie_ordre: number
  eleve: Eleve; ecole?: string
  pre?: number; quiz?: number; post?: number
  /** Points de pourcentage gagnés entre prétest et post-test. */
  progression?: number
}

export interface LigneSynthese {
  atelier: string; partie: string; partie_ordre: number
  inscrits: number; pre_et_post: number
  moyenne_pre?: number; moyenne_quiz?: number; moyenne_post?: number; progression_moyenne?: number
}

const moyenne = (v: (number | undefined)[]) => {
  const x = v.filter((n): n is number => n !== undefined)
  return x.length ? Math.round((x.reduce((s, n) => s + n, 0) / x.length) * 10) / 10 : undefined
}

/** Regroupe les lignes exportées : une ligne par élève et par partie, puis une synthèse par partie. */
export function analyserResultats(lignes: LigneExport[]): { eleves: LigneEleve[]; synthese: LigneSynthese[] } {
  const parEleve = new Map<string, LigneEleve>()
  for (const l of lignes) {
    const partie = l.partie ?? 'Atelier'
    const cle = [l.date, l.atelier, l.groupe, partie, l.eleve.id].join('|')
    const e = parEleve.get(cle) ?? {
      date: l.date, atelier: l.atelier, groupe: l.groupe, partie, partie_ordre: l.partie_ordre ?? 0, eleve: l.eleve, ecole: l.ecole,
    }
    const fait = l.statut && l.statut !== 'en_cours' ? pct(l.score, l.score_max) : undefined
    if (l.type === 'pretest') e.pre ??= fait
    if (l.type === 'quiz') e.quiz ??= fait
    if (l.type === 'posttest') e.post ??= fait
    parEleve.set(cle, e)
  }
  const eleves = [...parEleve.values()]
    .map((e) => ({ ...e, progression: e.pre !== undefined && e.post !== undefined ? Math.round((e.post - e.pre) * 10) / 10 : undefined }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.atelier.localeCompare(b.atelier) || a.groupe.localeCompare(b.groupe)
      || a.partie_ordre - b.partie_ordre || a.eleve.nom.localeCompare(b.eleve.nom) || a.eleve.prenom.localeCompare(b.eleve.prenom))

  const parPartie = new Map<string, LigneEleve[]>()
  for (const e of eleves) {
    const cle = `${e.atelier}|${e.partie}`
    parPartie.set(cle, [...(parPartie.get(cle) ?? []), e])
  }
  const synthese = [...parPartie.values()].map((g) => {
    const complets = g.filter((e) => e.progression !== undefined)
    return {
      atelier: g[0].atelier, partie: g[0].partie, partie_ordre: g[0].partie_ordre,
      inscrits: g.length, pre_et_post: complets.length,
      moyenne_pre: moyenne(g.map((e) => e.pre)), moyenne_quiz: moyenne(g.map((e) => e.quiz)), moyenne_post: moyenne(g.map((e) => e.post)),
      progression_moyenne: moyenne(complets.map((e) => e.progression)),
    }
  }).sort((a, b) => a.atelier.localeCompare(b.atelier) || a.partie_ordre - b.partie_ordre)
  return { eleves, synthese }
}

const n = (v?: number): Cellule => (v === undefined ? null : { value: v, type: Number })

export async function telechargerResultats(lignes: LigneExport[], camp: string) {
  const { eleves, synthese } = analyserResultats(lignes)
  await ecrire([
    {
      nom: 'Synthèse',
      lignes: [
        entete(['Atelier', 'Partie', 'Élèves inscrits', 'Ont fait prétest et post-test', 'Prétest moyen (%)', 'Quiz moyen (%)', 'Post-test moyen (%)', 'Progression moyenne (points)']),
        ...synthese.map((s) => [{ value: s.atelier }, { value: s.partie }, n(s.inscrits), n(s.pre_et_post), n(s.moyenne_pre), n(s.moyenne_quiz), n(s.moyenne_post), n(s.progression_moyenne)]),
      ],
      largeurs: [28, 22, 14, 18, 16, 14, 16, 18],
    },
    {
      nom: 'Élèves',
      lignes: [
        entete(['Date', 'Atelier', 'Groupe', 'Partie', 'Nom', 'Prénom', 'Sexe', 'Classe', 'École', 'Code', 'Prétest (%)', 'Quiz (%)', 'Post-test (%)', 'Progression (points)']),
        ...eleves.map((e) => [
          { value: e.date }, { value: e.atelier }, { value: e.groupe }, { value: e.partie }, { value: e.eleve.nom }, { value: e.eleve.prenom },
          { value: e.eleve.sexe }, { value: e.eleve.classe }, { value: e.ecole ?? '' }, { value: e.eleve.code_acces },
          n(e.pre), n(e.quiz), n(e.post), n(e.progression),
        ]),
      ],
      largeurs: [12, 26, 14, 20, 18, 16, 6, 8, 24, 10, 12, 10, 13, 16],
    },
  ], nomFichier('resultats', camp))
}
