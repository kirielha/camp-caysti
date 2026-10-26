import type { Langue, TypeFiche } from '../types'

const fr = {
  appNom: 'Camp CAYSTI',
  connexionTitre: 'Entre ton code',
  connexionAide: 'Ton code est sur ton badge. Il a 6 caractères.',
  connexionBouton: 'Entrer',
  codeInconnu: 'Ce code ne correspond à aucun élève. Vérifie ton badge ou demande à ton formateur.',
  codeCourt: 'Le code doit avoir 6 caractères.',
  demoCodes: 'Codes de démo',
  bonjour: (prenom: string) => `Bonjour ${prenom} !`,
  tesActivites: 'Tes activités du jour',
  aucuneActivite: 'Rien n’est ouvert pour le moment. Ton formateur va bientôt lancer une activité.',
  commencer: 'Commencer',
  reprendre: 'Reprendre',
  termine: 'Terminé',
  voirClassement: 'Voir le classement',
  deconnexion: 'Ce n’est pas moi',
  typeFiche: { pretest: 'Prétest', posttest: 'Post-test', quiz: 'Quiz', satisfaction: 'Ton avis' } satisfies Record<TypeFiche, string>,
  nbQuestions: (n: number) => `${n} question${n > 1 ? 's' : ''}`,
  avantDeCommencer: 'Avant de commencer',
  consigneChrono: 'Chaque question a son propre temps. Quand le temps est fini, on passe à la suivante.',
  consigneUneFois: 'Tu ne peux passer ce test qu’une fois.',
  consigneHonnete: 'Réponds seul·e : ce test sert à voir ce que tu sais déjà, pas à te juger.',
  jeSuisPret: 'Je suis prêt·e',
  question: (i: number, n: number) => `Question ${i} sur ${n}`,
  uneReponse: 'Une seule réponse',
  plusieursReponses: 'Plusieurs réponses possibles',
  ecrisTaReponse: 'Écris ta réponse ici…',
  valider: 'Valider',
  passer: 'Passer',
  secondes: (s: number) => `${s} s`,
  tempsEcoule: 'Temps écoulé !',
  echelle: ['Pas du tout', 'Un peu', 'Moyen', 'Beaucoup', 'Énormément'],
  bravo: 'Bravo, c’est envoyé !',
  tonScore: 'Ton score',
  points: (n: number) => `${n.toLocaleString('fr-FR')} pt${n > 1 ? 's' : ''}`,
  surPoints: (n: number) => `sur ${n.toLocaleString('fr-FR')}`,
  enAttente: (n: number) => `${n} réponse${n > 1 ? 's' : ''} écrite${n > 1 ? 's' : ''} sera corrigée${n > 1 ? 's' : ''} plus tard : ton score peut encore monter.`,
  merciAvis: 'Merci pour ton avis !',
  classement: 'Classement',
  top10: 'Les 10 premiers',
  pasDansTop: 'Tu n’es pas dans le top 10 cette fois. Le post-test est une nouvelle chance !',
  egaliteRegle: 'À égalité de points, le plus rapide passe devant.',
  retourActivites: 'Retour à mes activités',
  dejaFait: 'Tu as déjà passé ce test.',
  sessionFermee: 'Cette activité est fermée.',
  horsLigne: 'Hors ligne : tes réponses sont gardées sur la tablette.',
  chargement: 'Chargement…',
  reinitialiserDemo: 'Réinitialiser la démo',
  minutes: (ms: number) => {
    const s = Math.round(ms / 1000)
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`
  },
}

export type Textes = typeof fr

const en: Textes = {
  appNom: 'CAYSTI Camp',
  connexionTitre: 'Enter your code',
  connexionAide: 'Your code is on your badge. It has 6 characters.',
  connexionBouton: 'Enter',
  codeInconnu: 'This code does not match any student. Check your badge or ask your trainer.',
  codeCourt: 'The code must have 6 characters.',
  demoCodes: 'Demo codes',
  bonjour: (prenom) => `Hello ${prenom}!`,
  tesActivites: 'Your activities today',
  aucuneActivite: 'Nothing is open right now. Your trainer will start an activity soon.',
  commencer: 'Start',
  reprendre: 'Continue',
  termine: 'Done',
  voirClassement: 'See the ranking',
  deconnexion: 'This isn’t me',
  typeFiche: { pretest: 'Pre-test', posttest: 'Post-test', quiz: 'Quiz', satisfaction: 'Your opinion' },
  nbQuestions: (n) => `${n} question${n > 1 ? 's' : ''}`,
  avantDeCommencer: 'Before you start',
  consigneChrono: 'Each question has its own time. When time is up, the next one appears.',
  consigneUneFois: 'You can only take this test once.',
  consigneHonnete: 'Answer on your own: this test shows what you already know, it does not judge you.',
  jeSuisPret: 'I’m ready',
  question: (i, n) => `Question ${i} of ${n}`,
  uneReponse: 'One answer',
  plusieursReponses: 'Several answers possible',
  ecrisTaReponse: 'Write your answer here…',
  valider: 'Submit',
  passer: 'Skip',
  secondes: (s) => `${s} s`,
  tempsEcoule: 'Time’s up!',
  echelle: ['Not at all', 'A little', 'Somewhat', 'A lot', 'Loved it'],
  bravo: 'Well done, it’s sent!',
  tonScore: 'Your score',
  points: (n) => `${n.toLocaleString('en-GB')} pt${n > 1 ? 's' : ''}`,
  surPoints: (n) => `out of ${n.toLocaleString('en-GB')}`,
  enAttente: (n) => `${n} written answer${n > 1 ? 's' : ''} will be marked later: your score may still go up.`,
  merciAvis: 'Thanks for your opinion!',
  classement: 'Ranking',
  top10: 'Top 10',
  pasDansTop: 'You’re not in the top 10 this time. The post-test is a new chance!',
  egaliteRegle: 'When points are equal, the fastest comes first.',
  retourActivites: 'Back to my activities',
  dejaFait: 'You have already taken this test.',
  sessionFermee: 'This activity is closed.',
  horsLigne: 'Offline: your answers are kept on this tablet.',
  chargement: 'Loading…',
  reinitialiserDemo: 'Reset the demo',
  minutes: (ms) => {
    const s = Math.round(ms / 1000)
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`
  },
}

export const textes: Record<Langue, Textes> = { fr, en }

/** Champ bilingue : version anglaise si demandée et disponible, sinon français. */
export function traduire(obj: object, champ: string, langue: Langue): string {
  const o = obj as Record<string, unknown>
  const v = langue === 'en' ? (o[`${champ}_en`] as string | undefined) : undefined
  return v || (o[`${champ}_fr`] as string) || ''
}
