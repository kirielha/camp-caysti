// Données de démonstration (mode local uniquement).
// Codes élèves pour essayer : AMA234, YAW567, KEM789

import type {
  Choix, Eleve, Fiche, FicheQuestion, Question, Reponse, SessionEvaluation, Tentative,
} from '../types'
import type { BaseCamp } from './db'

/** UUID déterministe pour la démo : u(12) → 00000000-0000-4000-8000-000000000012 */
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const ID = {
  ville: u(1), camp: u(2),
  robotique: u(10), ia: u(11), iot: u(12), prog: u(13),
  atelierRobot: u(20), groupeA: u(21),
  formateur: u(30),
  compCapteur: u(40), compActionneur: u(41), compRobot: u(42),
  fichePre: u(100), ficheQuiz: u(101), ficheSatisf: u(102),
  sessionPre: u(200), sessionQuiz: u(201), sessionSatisf: u(202),
}

export const CODES_DEMO = ['AMA234', 'YAW567', 'KEM789']

export async function seedSiVide(db: BaseCamp) {
  if ((await db.eleve.count()) > 0) return
  await seed(db)
}

export async function reinitialiserDemo(db: BaseCamp) {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
  await seed(db)
}

async function seed(db: BaseCamp) {
  const auteur = ID.formateur
  await db.transaction('rw', db.tables, async () => {
    await db.technologie.bulkAdd([
      { id: ID.robotique, nom_fr: 'Robotique', nom_en: 'Robotics', couleur: '#e4572e' },
      { id: ID.ia, nom_fr: 'Intelligence artificielle', nom_en: 'Artificial intelligence', couleur: '#6c4ab6' },
      { id: ID.iot, nom_fr: 'Internet des objets', nom_en: 'Internet of Things', couleur: '#17a398' },
      { id: ID.prog, nom_fr: 'Programmation', nom_en: 'Programming', couleur: '#f2a541' },
    ])
    await db.camp.add({
      id: ID.camp, ville_id: ID.ville, nom: 'Camp CAYSTI Lomé — démo', date_debut: '2026-12-01', date_fin: '2026-12-05',
      lieu: 'Lomé', statut: 'en_cours',
    })
    await db.atelier.add({
      id: ID.atelierRobot, camp_id: ID.camp, technologie_id: ID.robotique,
      titre_fr: 'Mon premier robot', titre_en: 'My first robot',
    })
    await db.groupe.add({
      id: ID.groupeA, atelier_id: ID.atelierRobot, nom: 'Groupe A', date: '2026-12-01',
      heure_debut: '09:00', heure_fin: '12:00', salle: 'Salle 1',
    })
    await db.competence.bulkAdd([
      { id: ID.compCapteur, technologie_id: ID.robotique, libelle_fr: 'Reconnaître un capteur', libelle_en: 'Recognise a sensor' },
      { id: ID.compActionneur, technologie_id: ID.robotique, libelle_fr: 'Reconnaître un actionneur', libelle_en: 'Recognise an actuator' },
      { id: ID.compRobot, technologie_id: ID.robotique, libelle_fr: 'Définir un robot', libelle_en: 'Define a robot' },
    ])

    // ---------------- Élèves ----------------
    const eleves: Eleve[] = [
      ['AMA234', 'Ama', 'Mensah', 'F', '2014-05-12', 'CM2'],
      ['YAW567', 'Yaw', 'Agbodjan', 'M', '2013-02-03', '6e'],
      ['KEM789', 'Kemi', 'Adjovi', 'F', '2012-09-21', '5e'],
      ['CAMARA', 'Fatou', 'Camara', 'F', '2013-04-01', '6e'],
      ['DOSSOU', 'Koffi', 'Dossou', 'M', '2014-01-15', 'CM2'],
      ['ETSE22', 'Esi', 'Etse', 'F', '2012-11-30', '5e'],
      ['GNAMBA', 'Kwame', 'Gnamba', 'M', '2013-08-08', '6e'],
      ['HOUNSA', 'Afi', 'Hounsa', 'F', '2014-03-19', 'CM2'],
      ['KPAKPA', 'Mawuli', 'Kpakpa', 'M', '2012-06-25', '4e'],
      ['LAWSN5', 'Abla', 'Lawson', 'F', '2013-12-02', '6e'],
      ['NUBUKP', 'Sena', 'Nubukpo', 'M', '2014-07-07', 'CM2'],
    ].map(([code, prenom, nom, sexe, naissance, classe], i) => ({
      id: u(1000 + i), code_acces: code, prenom, nom, sexe: sexe as Eleve['sexe'],
      date_naissance: naissance, classe: classe as Eleve['classe'], langue_interface: 'fr',
    }))
    await db.eleve.bulkAdd(eleves)
    await db.inscription.bulkAdd(
      eleves.map((e, i) => ({ id: u(2000 + i), eleve_id: e.id, groupe_id: ID.groupeA, inscrit_le: '2026-11-20T10:00:00Z' })),
    )

    // ---------------- Banque de questions ----------------
    const questions: Question[] = []
    const choix: Choix[] = []
    let nq = 3000
    let nc = 4000
    const q = (base: Omit<Question, 'id' | 'auteur_id' | 'mode_bareme'> & { mode_bareme?: Question['mode_bareme'] }, options: [string, string, boolean][] = []) => {
      const id = u(nq++)
      questions.push({ mode_bareme: 'tout_ou_rien', ...base, id, auteur_id: auteur })
      options.forEach(([fr, en, ok], i) =>
        choix.push({ id: u(nc++), question_id: id, texte_fr: fr, texte_en: en, est_correct: ok, ordre: i }),
      )
      return id
    }

    // Prétest robotique
    const pre = [
      q({ type: 'qcm_unique', enonce_fr: 'À quoi sert un capteur sur un robot ?', enonce_en: 'What does a sensor do on a robot?', duree_secondes: 30, points: 1, competence_id: ID.compCapteur }, [
        ['À mesurer quelque chose autour du robot', 'It measures something around the robot', true],
        ['À faire bouger les roues', 'It makes the wheels move', false],
        ['À stocker l’énergie', 'It stores energy', false],
        ['À décorer le robot', 'It decorates the robot', false],
      ]),
      q({ type: 'qcm_multiple', mode_bareme: 'proportionnel', enonce_fr: 'Coche tous les capteurs.', enonce_en: 'Tick all the sensors.', duree_secondes: 40, points: 3, competence_id: ID.compCapteur }, [
        ['Capteur à ultrasons', 'Ultrasonic sensor', true],
        ['Capteur infrarouge', 'Infrared sensor', true],
        ['Capteur de lumière', 'Light sensor', true],
        ['Moteur', 'Motor', false],
      ]),
      q({ type: 'qcm_unique', image: 'demo/led.svg', enonce_fr: 'Quel est ce composant ?', enonce_en: 'What is this component?', duree_secondes: 25, points: 1, competence_id: ID.compActionneur }, [
        ['Une LED', 'An LED', true],
        ['Une résistance', 'A resistor', false],
        ['Un moteur', 'A motor', false],
        ['Une pile', 'A battery', false],
      ]),
      q({ type: 'qcm_unique', enonce_fr: 'Pour avancer, un robot a surtout besoin…', enonce_en: 'To move forward, a robot mostly needs…', duree_secondes: 25, points: 1, competence_id: ID.compActionneur }, [
        ['d’un moteur', 'a motor', true],
        ['d’un écran', 'a screen', false],
        ['d’un haut-parleur', 'a speaker', false],
      ]),
      q({
        type: 'qro_ia', enonce_fr: 'Explique avec tes mots ce qu’est un robot.', enonce_en: 'Explain in your own words what a robot is.',
        duree_secondes: 90, points: 2, competence_id: ID.compRobot,
        reponse_attendue_fr: 'Une machine programmable qui perçoit son environnement avec des capteurs et agit avec des actionneurs.',
        reponse_attendue_en: 'A programmable machine that senses its environment with sensors and acts with actuators.',
        criteres_correction: '1 point : machine programmable ; 1 point : capteurs/perception ET actionneurs/action.',
      }),
      q({ type: 'qro_qualitative', enonce_fr: 'Qu’aimerais-tu construire pendant ce camp ?', enonce_en: 'What would you like to build during this camp?', duree_secondes: 90, points: 0 }),
    ]

    // Quiz
    const quiz = [
      q({ type: 'qcm_unique', enonce_fr: 'Un capteur à ultrasons mesure…', enonce_en: 'An ultrasonic sensor measures…', duree_secondes: 15, points: 1, competence_id: ID.compCapteur }, [
        ['une distance', 'a distance', true], ['une couleur', 'a colour', false], ['une température', 'a temperature', false],
      ]),
      q({ type: 'qcm_unique', enonce_fr: 'Lequel est un actionneur ?', enonce_en: 'Which one is an actuator?', duree_secondes: 15, points: 1, competence_id: ID.compActionneur }, [
        ['Un servomoteur', 'A servo motor', true], ['Un bouton', 'A button', false], ['Un micro', 'A microphone', false],
      ]),
      q({ type: 'qcm_multiple', enonce_fr: 'Qu’est-ce qui peut alimenter un robot ?', enonce_en: 'What can power a robot?', duree_secondes: 20, points: 2, competence_id: ID.compActionneur }, [
        ['Une pile', 'A battery', true], ['Un panneau solaire', 'A solar panel', true], ['Un capteur', 'A sensor', false],
      ]),
    ]

    // Satisfaction
    const satisf = [
      q({ type: 'echelle', enonce_fr: 'As-tu aimé cet atelier ?', enonce_en: 'Did you enjoy this workshop?', duree_secondes: 30, points: 0 }),
      q({ type: 'qro_qualitative', enonce_fr: 'Qu’est-ce que tu as préféré ?', enonce_en: 'What did you like best?', duree_secondes: 90, points: 0 }),
    ]

    await db.question.bulkAdd(questions)
    await db.choix.bulkAdd(choix)

    const fiche = (id: string, type: Fiche['type'], fr: string, en: string): Fiche => ({
      id, type, titre_fr: fr, titre_en: en, technologie_id: ID.robotique, mode_correction: 'ia_definitive',
      visibilite: 'officielle', statut_validation: 'validee', auteur_id: auteur, version: 1,
    })
    await db.fiche.bulkAdd([
      fiche(ID.fichePre, 'pretest', 'Prétest — Mon premier robot', 'Pre-test — My first robot'),
      fiche(ID.ficheQuiz, 'quiz', 'Quiz express : capteurs et moteurs', 'Quick quiz: sensors and motors'),
      fiche(ID.ficheSatisf, 'satisfaction', 'Ton avis sur l’atelier', 'Your opinion on the workshop'),
    ])
    const liens: FicheQuestion[] = [
      ...pre.map((question_id, ordre) => ({ fiche_id: ID.fichePre, question_id, ordre })),
      ...quiz.map((question_id, ordre) => ({ fiche_id: ID.ficheQuiz, question_id, ordre })),
      ...satisf.map((question_id, ordre) => ({ fiche_id: ID.ficheSatisf, question_id, ordre })),
    ]
    await db.fiche_question.bulkAdd(liens)

    const session = (id: string, fiche_id: string): SessionEvaluation => ({
      id, fiche_id, groupe_id: ID.groupeA, mode: 'libre', mode_correction: 'ia_definitive', statut: 'ouverte',
      classement_affiche: true, etape: 'attente', ouverte_le: '2026-12-01T09:00:00Z',
    })
    await db.session_evaluation.bulkAdd([
      session(ID.sessionPre, ID.fichePre),
      session(ID.sessionQuiz, ID.ficheQuiz),
      { ...session(ID.sessionSatisf, ID.ficheSatisf), classement_affiche: false },
    ])

    // Camarades ayant déjà passé le prétest (pour un classement vivant)
    const tentatives: Tentative[] = []
    const reponses: Reponse[] = []
    const resultats: [number, number][] = [[7, 182000], [6, 150000], [6, 171000], [5, 140000], [4.5, 198000], [4, 120000], [3, 160000], [2.5, 210000]]
    eleves.slice(3).forEach((e, i) => {
      const [score, temps] = resultats[i]
      const id = u(5000 + i)
      tentatives.push({
        id, session_id: ID.sessionPre, eleve_id: e.id, langue: 'fr', debut: '2026-12-01T09:10:00Z',
        fin: '2026-12-01T09:15:00Z', score, score_max: 8, temps_total_ms: temps, statut: 'soumise',
      })
      reponses.push({ id: u(6000 + i), tentative_id: id, question_id: pre[0], choix_coches: [], statut_correction: 'auto', score_final: score, temps_ms: temps })
    })
    await db.tentative.bulkAdd(tentatives)
    await db.reponse.bulkAdd(reponses)
  })
}
