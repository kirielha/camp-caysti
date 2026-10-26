// Contrôles d'une fiche avant enregistrement ou soumission.
// Les messages sont écrits pour le formateur : ils disent quoi corriger et où.

import type { FicheEditable } from '../data/staffRepository'

export interface Probleme {
  /** Index de la question concernée (absent = problème sur la fiche elle-même). */
  question?: number
  message: string
}

export function verifierFiche({ fiche, questions }: FicheEditable, pourSoumission = false): Probleme[] {
  const problemes: Probleme[] = []
  if (!fiche.titre_fr.trim()) problemes.push({ message: 'Donnez un titre en français à la fiche.' })
  if (fiche.type === 'posttest' && pourSoumission && !fiche.fiche_jumelle_id) {
    problemes.push({ message: 'Choisissez le prétest auquel ce post-test sera comparé.' })
  }
  if (questions.length === 0) problemes.push({ message: 'Ajoutez au moins une question.' })

  questions.forEach((q, i) => {
    const p = (message: string) => problemes.push({ question: i, message })
    if (!q.enonce_fr.trim()) p('Écrivez l’énoncé en français.')
    if (!(q.duree_secondes >= 5 && q.duree_secondes <= 600)) p('La durée doit être comprise entre 5 et 600 secondes.')

    if (q.type === 'qcm_unique' || q.type === 'qcm_multiple') {
      const remplis = q.choix.filter((c) => c.texte_fr.trim() || c.image)
      const bons = q.choix.filter((c) => c.est_correct)
      if (remplis.length < 2) p('Proposez au moins deux réponses.')
      if (remplis.length < q.choix.length) p('Une réponse est vide : écrivez son texte, ajoutez une image ou supprimez-la.')
      if (bons.length === 0) p('Cochez la bonne réponse.')
      if (q.type === 'qcm_unique' && bons.length > 1) p('Une seule bonne réponse est possible : passez en « plusieurs réponses » ou décochez-en.')
      if (q.type === 'qcm_multiple' && bons.length === q.choix.length && q.choix.length > 0) p('Toutes les réponses sont cochées comme bonnes : laissez au moins un piège.')
      if (!(q.points > 0)) p('Une question notée doit valoir au moins un point.')
    }
    if (q.type === 'qro_ia') {
      if (!q.reponse_attendue_fr?.trim()) p('Écrivez la réponse attendue : l’IA s’en sert pour corriger.')
      if (!(q.points > 0)) p('Une question notée doit valoir au moins un point.')
    }
    if (fiche.type === 'satisfaction' && (q.type === 'qcm_unique' || q.type === 'qcm_multiple' || q.type === 'qro_ia')) {
      p('Une fiche d’avis ne contient que des questions non notées (échelle ou réponse libre).')
    }
  })
  return problemes
}
