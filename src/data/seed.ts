// Données de démonstration (mode local uniquement).
// Une journée de camp à Lomé : atelier Robotique le matin, atelier Impression 3D l'après-midi.
// Chaque atelier a son prétest, son quiz, son post-test et son questionnaire d'avis.
// Codes élèves pour essayer : AMA234, YAW567, KEM789

import type {
  AttributionRole, Choix, Eleve, Fiche, FicheQuestion, GroupeFormateur, Question, Reponse, SessionEvaluation, Tentative, Utilisateur,
} from '../types'
import type { BaseCamp } from './db'

/** UUID déterministe pour la démo : u(12) → 00000000-0000-4000-8000-000000000012 */
/** Chemin d'une illustration de démo (public/demo). */
const img = (nom: string) => `demo/${nom}.svg`

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const ID = {
  ville: u(1), camp: u(2),
  robotique: u(10), ia: u(11), iot: u(12), prog: u(13), impression3d: u(14),
  atelierRobot: u(20), groupeA: u(21), atelier3d: u(22), groupeB: u(23),
  formateur: u(30), formatrice3d: u(31), superAdmin: u(32), adminCamp: u(33),
  ficheSecurite: u(107),
  ecoleTokoin: u(70), ecoleBe: u(71), ecoleAdido: u(72),
  langFr: u(80), langEn: u(81), langEwe: u(82), langMina: u(83), langKabye: u(84), langAutre: u(85),
  compCapteur: u(40), compActionneur: u(41), compRobot: u(42),
  compFabrication: u(43), compMateriau: u(44), compChaine: u(45), compProjet: u(46),
  fichePreRobot: u(100), ficheQuizRobot: u(101), fichePostRobot: u(102),
  fichePre3d: u(103), ficheQuiz3d: u(104), fichePost3d: u(105),
  ficheAvis: u(106),
}

export const CODES_DEMO = ['AMA234', 'YAW567', 'KEM789']

/** À incrémenter à chaque changement des données de démo : les navigateurs les rechargent alors. */
const VERSION_DEMO = '6'
const CLE_VERSION = 'camp-caysti:version-demo'

export async function seedSiVide(db: BaseCamp) {
  let version: string | null = null
  try { version = localStorage.getItem(CLE_VERSION) } catch { /* stockage indisponible */ }
  if ((await db.eleve.count()) > 0 && version === VERSION_DEMO) return
  await reinitialiserDemo(db)
}

export async function reinitialiserDemo(db: BaseCamp) {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
  await seed(db)
  try { localStorage.setItem(CLE_VERSION, VERSION_DEMO) } catch { /* stockage indisponible */ }
}

type Option = [fr: string, en: string, correct: boolean, image?: string]
type BaseQuestion = Omit<Question, 'id' | 'auteur_id' | 'mode_bareme'> & { mode_bareme?: Question['mode_bareme'] }

async function seed(db: BaseCamp) {
  const auteur = ID.formateur
  const questions: Question[] = []
  const choix: Choix[] = []
  const liens: FicheQuestion[] = []
  let nq = 3000
  let nc = 4000

  /** Crée une question (avec ses choix) et renvoie son id. */
  const q = (base: BaseQuestion, options: Option[] = [], jumelle?: string) => {
    const id = u(nq++)
    questions.push({ mode_bareme: 'tout_ou_rien', ...base, id, auteur_id: auteur, question_jumelle_id: jumelle })
    options.forEach(([fr, en, ok, image], i) =>
      choix.push({ id: u(nc++), question_id: id, texte_fr: fr, texte_en: en, est_correct: ok, ordre: i, image: image && img(image) }),
    )
    return id
  }
  const relier = (fiche_id: string, ids: string[]) => ids.forEach((question_id, ordre) => liens.push({ fiche_id, question_id, ordre }))

  // ======================= Robotique =======================
  const preRobot = [
    q({ type: 'qcm_unique', image: img('ultrason'), enonce_fr: 'À quoi sert un capteur sur un robot ?', enonce_en: 'What does a sensor do on a robot?', duree_secondes: 30, points: 1, competence_id: ID.compCapteur }, [
      ['À mesurer quelque chose autour du robot', 'It measures something around the robot', true],
      ['À faire bouger les roues', 'It makes the wheels move', false],
      ['À stocker l’énergie', 'It stores energy', false],
      ['À décorer le robot', 'It decorates the robot', false],
    ]),
    q({ type: 'qcm_multiple', mode_bareme: 'proportionnel', enonce_fr: 'Coche tous les capteurs.', enonce_en: 'Tick all the sensors.', duree_secondes: 40, points: 3, competence_id: ID.compCapteur }, [
      ['Capteur à ultrasons', 'Ultrasonic sensor', true, 'ultrason'],
      ['Capteur infrarouge', 'Infrared sensor', true, 'infrarouge'],
      ['Capteur de lumière', 'Light sensor', true, 'lumiere'],
      ['Moteur', 'Motor', false, 'moteur'],
    ]),
    q({ type: 'qcm_unique', image: img('led'), enonce_fr: 'Quel est ce composant ?', enonce_en: 'What is this component?', duree_secondes: 25, points: 1, competence_id: ID.compActionneur }, [
      ['Une LED', 'An LED', true],
      ['Une résistance', 'A resistor', false],
      ['Un moteur', 'A motor', false],
      ['Une pile', 'A battery', false, 'pile'],
    ]),
    q({ type: 'qcm_unique', enonce_fr: 'Pour avancer, un robot a surtout besoin…', enonce_en: 'To move forward, a robot mostly needs…', duree_secondes: 25, points: 1, competence_id: ID.compActionneur }, [
      ['d’un moteur', 'a motor', true, 'moteur'],
      ['d’un écran', 'a screen', false, 'ecran'],
      ['d’un haut-parleur', 'a speaker', false, 'hautparleur'],
    ]),
    q({
      type: 'qro_ia', image: img('robot'), enonce_fr: 'Explique avec tes mots ce qu’est un robot.', enonce_en: 'Explain in your own words what a robot is.',
      duree_secondes: 90, points: 2, competence_id: ID.compRobot,
      reponse_attendue_fr: 'Une machine programmable qui perçoit son environnement avec des capteurs et agit avec des actionneurs.',
      reponse_attendue_en: 'A programmable machine that senses its environment with sensors and acts with actuators.',
      criteres_correction: '1 point : machine programmable ; 1 point : capteurs/perception ET actionneurs/action.',
    }),
    q({ type: 'qro_qualitative', image: img('robot'), enonce_fr: 'Qu’aimerais-tu construire pendant cet atelier ?', enonce_en: 'What would you like to build during this workshop?', duree_secondes: 90, points: 0 }),
  ]
  // Post-test : mêmes compétences, formulations différentes (questions jumelles)
  const postRobot = [
    q({ type: 'qcm_unique', image: img('infrarouge'), enonce_fr: 'Quel est le rôle d’un capteur dans un robot ?', enonce_en: 'What is the role of a sensor in a robot?', duree_secondes: 30, points: 1, competence_id: ID.compCapteur }, [
      ['Faire tourner les moteurs', 'Turn the motors', false],
      ['Donner au robot des informations sur ce qui l’entoure', 'Give the robot information about its surroundings', true],
      ['Recharger la batterie', 'Charge the battery', false],
    ], preRobot[0]),
    q({ type: 'qcm_multiple', mode_bareme: 'proportionnel', enonce_fr: 'Lesquels permettent au robot de percevoir ?', enonce_en: 'Which ones let the robot perceive?', duree_secondes: 40, points: 3, competence_id: ID.compCapteur }, [
      ['Une roue', 'A wheel', false, 'roue'],
      ['Une caméra', 'A camera', true, 'camera'],
      ['Un microphone', 'A microphone', true, 'micro'],
      ['Un capteur de distance', 'A distance sensor', true, 'ultrason'],
    ], preRobot[1]),
    q({ type: 'qcm_unique', image: img('led'), enonce_fr: 'Une LED qui s’allume est un exemple…', enonce_en: 'An LED lighting up is an example of…', duree_secondes: 25, points: 1, competence_id: ID.compActionneur }, [
      ['d’actionneur', 'an actuator', true],
      ['de capteur', 'a sensor', false],
      ['de batterie', 'a battery', false],
    ], preRobot[2]),
    q({ type: 'qcm_unique', enonce_fr: 'Quel composant fait tourner les roues d’un robot ?', enonce_en: 'Which component turns a robot’s wheels?', duree_secondes: 25, points: 1, competence_id: ID.compActionneur }, [
      ['Le capteur infrarouge', 'The infrared sensor', false, 'infrarouge'],
      ['Le moteur', 'The motor', true, 'moteur'],
      ['La LED', 'The LED', false, 'led'],
    ], preRobot[3]),
    q({
      type: 'qro_ia', image: img('robot'), enonce_fr: 'Un camarade te demande ce qu’est un robot. Que lui réponds-tu ?', enonce_en: 'A friend asks you what a robot is. What do you answer?',
      duree_secondes: 90, points: 2, competence_id: ID.compRobot,
      reponse_attendue_fr: 'Une machine programmable qui perçoit son environnement avec des capteurs et agit avec des actionneurs.',
      reponse_attendue_en: 'A programmable machine that senses its environment with sensors and acts with actuators.',
      criteres_correction: '1 point : machine programmable ; 1 point : capteurs/perception ET actionneurs/action.',
    }, [], preRobot[4]),
  ]
  const quizRobot = [
    q({ type: 'qcm_unique', image: img('ultrason'), enonce_fr: 'Un capteur à ultrasons mesure…', enonce_en: 'An ultrasonic sensor measures…', duree_secondes: 15, points: 1, competence_id: ID.compCapteur }, [
      ['une distance', 'a distance', true], ['une couleur', 'a colour', false], ['une température', 'a temperature', false],
    ]),
    q({ type: 'qcm_unique', enonce_fr: 'Lequel est un actionneur ?', enonce_en: 'Which one is an actuator?', duree_secondes: 15, points: 1, competence_id: ID.compActionneur }, [
      ['Un servomoteur', 'A servo motor', true, 'servo'], ['Un bouton', 'A button', false, 'bouton'], ['Un micro', 'A microphone', false, 'micro'],
    ]),
    q({ type: 'qcm_multiple', enonce_fr: 'Qu’est-ce qui peut alimenter un robot ?', enonce_en: 'What can power a robot?', duree_secondes: 20, points: 2, competence_id: ID.compActionneur }, [
      ['Une pile', 'A battery', true], ['Un panneau solaire', 'A solar panel', true, 'solaire'], ['Un capteur', 'A sensor', false, 'lumiere'],
    ]),
  ]

  // ===================== Impression 3D =====================
  const pre3d = [
    q({ type: 'qcm_unique', image: img('imprimante3d'), enonce_fr: 'Que fait une imprimante 3D ?', enonce_en: 'What does a 3D printer do?', duree_secondes: 25, points: 1, competence_id: ID.compFabrication }, [
      ['Elle fabrique un objet couche par couche', 'It builds an object layer by layer', true],
      ['Elle prend des photos en relief', 'It takes 3D photos', false],
      ['Elle imprime sur du papier épais', 'It prints on thick paper', false],
    ]),
    q({ type: 'qcm_unique', enonce_fr: 'Quel matériau utilise le plus souvent l’imprimante de l’atelier ?', enonce_en: 'Which material does the workshop printer use most often?', duree_secondes: 25, points: 1, competence_id: ID.compMateriau }, [
      ['Le PLA, un plastique fait à partir de maïs', 'PLA, a plastic made from corn', true, 'pla'],
      ['Le fer', 'Iron', false, 'fer'],
      ['Le bois', 'Wood', false, 'bois'],
      ['Le verre', 'Glass', false, 'verre'],
    ]),
    q({ type: 'qcm_multiple', mode_bareme: 'proportionnel', image: img('trancheur'), enonce_fr: 'Coche les étapes nécessaires pour imprimer un objet.', enonce_en: 'Tick the steps needed to print an object.', duree_secondes: 40, points: 3, competence_id: ID.compChaine }, [
      ['Dessiner l’objet en 3D sur l’ordinateur', 'Draw the object in 3D on the computer', true],
      ['Préparer le fichier avec un trancheur', 'Prepare the file with a slicer', true],
      ['Lancer l’impression', 'Start the print', true],
      ['Scanner une feuille de papier', 'Scan a sheet of paper', false],
    ]),
    q({
      type: 'qro_ia', image: img('imprimante3d'), enonce_fr: 'Cite un objet utile que tu pourrais imprimer en 3D, et dis à quoi il servirait.', enonce_en: 'Name a useful object you could 3D print, and say what it would be for.',
      duree_secondes: 90, points: 2, competence_id: ID.compProjet,
      reponse_attendue_fr: 'Un objet concret et réalisable (porte-clé, support de téléphone, pièce de rechange…) avec un usage précis.',
      reponse_attendue_en: 'A concrete, feasible object (key ring, phone stand, spare part…) with a clear use.',
      criteres_correction: '1 point : objet concret et imprimable ; 1 point : usage précis.',
    }),
  ]
  const post3d = [
    q({ type: 'qcm_unique', image: img('couches'), enonce_fr: 'Comment une imprimante 3D construit-elle un objet ?', enonce_en: 'How does a 3D printer build an object?', duree_secondes: 25, points: 1, competence_id: ID.compFabrication }, [
      ['En le sculptant dans un bloc', 'By carving it out of a block', false],
      ['En empilant de fines couches de matière', 'By stacking thin layers of material', true],
      ['En le moulant d’un seul coup', 'By moulding it in one go', false],
    ], pre3d[0]),
    q({ type: 'qcm_unique', image: img('pla'), enonce_fr: 'Le PLA est…', enonce_en: 'PLA is…', duree_secondes: 25, points: 1, competence_id: ID.compMateriau }, [
      ['un métal', 'a metal', false],
      ['un plastique d’origine végétale', 'a plant-based plastic', true],
      ['une sorte de colle', 'a kind of glue', false],
    ], pre3d[1]),
    q({ type: 'qcm_multiple', mode_bareme: 'proportionnel', image: img('imprimante3d'), enonce_fr: 'Coche ce qu’on fait avant de lancer une impression 3D.', enonce_en: 'Tick what you do before starting a 3D print.', duree_secondes: 40, points: 3, competence_id: ID.compChaine }, [
      ['Modéliser l’objet', 'Model the object', true],
      ['Le découper en couches avec un trancheur', 'Slice it into layers with a slicer', true],
      ['Vérifier que le plateau est propre et réglé', 'Check the bed is clean and level', true],
      ['Peindre l’objet', 'Paint the object', false],
    ], pre3d[2]),
    q({
      type: 'qro_ia', image: img('couches'), enonce_fr: 'Quel objet as-tu conçu pendant l’atelier, et à quoi sert-il ?', enonce_en: 'Which object did you design during the workshop, and what is it for?',
      duree_secondes: 90, points: 2, competence_id: ID.compProjet,
      reponse_attendue_fr: 'Un objet concret conçu par l’élève, avec un usage précis.',
      reponse_attendue_en: 'A concrete object designed by the student, with a clear use.',
      criteres_correction: '1 point : objet décrit ; 1 point : usage précis.',
    }, [], pre3d[3]),
  ]
  const quiz3d = [
    q({ type: 'qcm_unique', image: img('trancheur'), enonce_fr: 'Le logiciel qui découpe un modèle en couches s’appelle…', enonce_en: 'The software that slices a model into layers is called…', duree_secondes: 15, points: 1, competence_id: ID.compChaine }, [
      ['un trancheur', 'a slicer', true], ['un navigateur', 'a browser', false], ['un tableur', 'a spreadsheet', false],
    ]),
    q({ type: 'qcm_unique', image: img('imprimante3d'), enonce_fr: 'Imprimer un petit objet en 3D prend en général…', enonce_en: 'Printing a small 3D object usually takes…', duree_secondes: 15, points: 1, competence_id: ID.compFabrication }, [
      ['quelques secondes', 'a few seconds', false], ['de quelques minutes à quelques heures', 'from minutes to a few hours', true], ['plusieurs semaines', 'several weeks', false],
    ]),
  ]

  // ================ Avis (même fiche pour les deux ateliers) ================
  const avis = [
    q({ type: 'echelle', enonce_fr: 'As-tu aimé cet atelier ?', enonce_en: 'Did you enjoy this workshop?', duree_secondes: 30, points: 0 }),
    q({ type: 'qro_qualitative', enonce_fr: 'Qu’est-ce que tu as préféré ?', enonce_en: 'What did you like best?', duree_secondes: 90, points: 0 }),
  ]

  // Fiche soumise par la formatrice 3D, en attente de validation par un admin
  const securite = [
    q({ type: 'qcm_unique', image: img('imprimante3d'), enonce_fr: 'Pendant une impression, la buse de l’imprimante est…', enonce_en: 'During a print, the printer nozzle is…', duree_secondes: 20, points: 1, competence_id: ID.compFabrication }, [
      ['très chaude : on ne la touche pas', 'very hot: do not touch it', true],
      ['froide', 'cold', false],
      ['tiède', 'lukewarm', false],
    ]),
    q({ type: 'qcm_multiple', enonce_fr: 'Coche les bons réflexes au fab lab.', enonce_en: 'Tick the right habits in the fab lab.', duree_secondes: 30, points: 2, competence_id: ID.compChaine }, [
      ['Attendre que la pièce refroidisse avant de la retirer', 'Wait for the part to cool before removing it', true],
      ['Prévenir le formateur si l’impression se décolle', 'Tell the trainer if the print comes loose', true],
      ['Mettre les doigts sous la buse pour vérifier', 'Put your fingers under the nozzle to check', false],
    ]),
  ]
  relier(ID.ficheSecurite, securite)
  relier(ID.fichePreRobot, preRobot)
  relier(ID.ficheQuizRobot, quizRobot)
  relier(ID.fichePostRobot, postRobot)
  relier(ID.fichePre3d, pre3d)
  relier(ID.ficheQuiz3d, quiz3d)
  relier(ID.fichePost3d, post3d)
  relier(ID.ficheAvis, avis)

  const fiche = (id: string, type: Fiche['type'], technologie_id: string | undefined, fr: string, en: string, jumelle?: string): Fiche => ({
    id, type, titre_fr: fr, titre_en: en, technologie_id, mode_correction: 'ia_definitive',
    visibilite: 'officielle', statut_validation: 'validee', version: 1, fiche_jumelle_id: jumelle,
    auteur_id: technologie_id === ID.impression3d ? ID.formatrice3d : auteur,
    validee_par: ID.superAdmin, validee_le: '2026-11-25T10:00:00Z',
  })
  const fiches = [
    fiche(ID.fichePreRobot, 'pretest', ID.robotique, 'Prétest — Mon premier robot', 'Pre-test — My first robot'),
    fiche(ID.ficheQuizRobot, 'quiz', ID.robotique, 'Quiz express : capteurs et moteurs', 'Quick quiz: sensors and motors'),
    fiche(ID.fichePostRobot, 'posttest', ID.robotique, 'Post-test — Mon premier robot', 'Post-test — My first robot', ID.fichePreRobot),
    fiche(ID.fichePre3d, 'pretest', ID.impression3d, 'Prétest — Imprimer en 3D', 'Pre-test — 3D printing'),
    fiche(ID.ficheQuiz3d, 'quiz', ID.impression3d, 'Quiz express : la chaîne d’impression', 'Quick quiz: the printing chain'),
    fiche(ID.fichePost3d, 'posttest', ID.impression3d, 'Post-test — Imprimer en 3D', 'Post-test — 3D printing', ID.fichePre3d),
    fiche(ID.ficheAvis, 'satisfaction', undefined, 'Ton avis sur l’atelier', 'Your opinion on the workshop'),
    {
      ...fiche(ID.ficheSecurite, 'quiz', ID.impression3d, 'Quiz : la sécurité au fab lab', 'Quiz: safety in the fab lab'),
      visibilite: 'privee' as const, statut_validation: 'soumise' as const, validee_par: undefined, validee_le: undefined,
    },
  ]

  // Personnel
  const personnel: Utilisateur[] = [
    { id: ID.superAdmin, prenom: 'Arielle', nom: 'Kitio', email: 'direction@caysti.demo', langue_interface: 'fr', actif: true },
    { id: ID.adminCamp, prenom: 'Edem', nom: 'Amouzou', email: 'camp.lome@caysti.demo', langue_interface: 'fr', actif: true },
    { id: ID.formateur, prenom: 'Komla', nom: 'Agbeko', email: 'komla@caysti.demo', langue_interface: 'fr', actif: true },
    { id: ID.formatrice3d, prenom: 'Akossiwa', nom: 'Dzifa', email: 'akossiwa@caysti.demo', langue_interface: 'fr', actif: true },
  ]
  const roles: AttributionRole[] = [
    { id: u(60), utilisateur_id: ID.superAdmin, role: 'super_admin' },
    { id: u(61), utilisateur_id: ID.adminCamp, role: 'admin_camp', camp_id: ID.camp },
    { id: u(62), utilisateur_id: ID.formateur, role: 'formateur', camp_id: ID.camp },
    { id: u(63), utilisateur_id: ID.formatrice3d, role: 'formateur', camp_id: ID.camp },
  ]
  const affectations: GroupeFormateur[] = [
    { id: u(64), groupe_id: ID.groupeA, utilisateur_id: ID.formateur, role: 'principal' },
    { id: u(65), groupe_id: ID.groupeA, utilisateur_id: ID.formatrice3d, role: 'secondaire' },
    { id: u(66), groupe_id: ID.groupeB, utilisateur_id: ID.formatrice3d, role: 'principal' },
  ]

  // Sessions : chaque fiche ouverte pour le groupe de son atelier
  let ns = 200
  const sessions: SessionEvaluation[] = []
  // Robotique (en cours) : prétest et quiz ouverts, post-test et avis pas encore ouverts.
  // Impression 3D (à venir) : prétest prêt, il deviendra accessible au démarrage de l'atelier.
  const creerSession = (fiche_id: string, groupe_id: string, statut: SessionEvaluation['statut'], classement_affiche = true) => {
    const id = u(ns++)
    sessions.push({
      id, fiche_id, groupe_id, mode: 'libre', mode_correction: 'ia_definitive', statut,
      classement_affiche, etape: 'attente', ouverte_le: statut === 'ouverte' ? '2026-12-01T09:00:00Z' : undefined,
    })
    return id
  }
  const S = {
    preRobot: creerSession(ID.fichePreRobot, ID.groupeA, 'ouverte'),
    quizRobot: creerSession(ID.ficheQuizRobot, ID.groupeA, 'ouverte'),
    postRobot: creerSession(ID.fichePostRobot, ID.groupeA, 'brouillon'),
    avisRobot: creerSession(ID.ficheAvis, ID.groupeA, 'brouillon', false),
    pre3d: creerSession(ID.fichePre3d, ID.groupeB, 'ouverte'),
    quiz3d: creerSession(ID.ficheQuiz3d, ID.groupeB, 'brouillon'),
    post3d: creerSession(ID.fichePost3d, ID.groupeB, 'brouillon'),
    avis3d: creerSession(ID.ficheAvis, ID.groupeB, 'brouillon', false),
  }

  // Élèves : tous inscrits aux deux ateliers de la journée
  const eleves: Eleve[] = [
    ['AMA234', 'Ama', 'Mensah', 'F', '2014-05-12', 'CM2'],
    ['YAW567', 'Yaw', 'Agbodjan', 'M', '2013-02-03', '6e'],
    ['KEM789', 'Kemi', 'Adjovi', 'F', '2012-09-21', '5e'],
    ['CAMARA', 'Fatou', 'Camara', 'F', '2013-04-01', '6e'],
    ['DSSU25', 'Koffi', 'Dossou', 'M', '2014-01-15', 'CM2'],
    ['ETSE22', 'Esi', 'Etse', 'F', '2012-11-30', '5e'],
    ['GNAMBA', 'Kwame', 'Gnamba', 'M', '2013-08-08', '6e'],
    ['HUNSA3', 'Afi', 'Hounsa', 'F', '2014-03-19', 'CM2'],
    ['KPAKPA', 'Mawuli', 'Kpakpa', 'M', '2012-06-25', '4e'],
    ['LAWSN5', 'Abla', 'Lawson', 'F', '2013-12-02', '6e'],
    ['NUBKP7', 'Sena', 'Nubukpo', 'M', '2014-07-07', 'CM2'],
  ].map(([code, prenom, nom, sexe, naissance, classe], i) => ({
    id: u(1000 + i), code_acces: code, prenom, nom: nom.toUpperCase(), sexe: sexe as Eleve['sexe'],
    date_naissance: naissance, classe: classe as Eleve['classe'], langue_interface: 'fr',
    ecole_id: [ID.ecoleTokoin, ID.ecoleBe, ID.ecoleAdido][i % 3],
    langue_id: [ID.langEwe, ID.langFr, ID.langMina, ID.langKabye][i % 4],
  }))
  const tuteurs = eleves.map((e, i) => ({
    id: u(7000 + i), nom: `${['Mme', 'M.'][i % 2]} ${e.nom}`, lien: ['mère', 'père'][i % 2],
    telephone: `+228 90 ${String(10 + i).padStart(2, '0')} ${String(20 + i * 3).padStart(2, '0')} ${String(30 + i).padStart(2, '0')}`,
    whatsapp: i % 3 === 0 ? undefined : `+228 91 ${String(40 + i).padStart(2, '0')} ${String(11 + i).padStart(2, '0')} 00`,
    email: i % 2 === 0 ? `parent.${e.prenom.toLowerCase()}@exemple.tg` : undefined,
    consentement_le: '2026-11-15T10:00:00Z', consentement_mode: 'autorisation signée',
  }))

  // Camarades ayant déjà passé certains tests (pour des classements vivants)
  const tentatives: Tentative[] = []
  const reponses: Reponse[] = []
  let nt = 5000
  const resultats = (session_id: string, score_max: number, scores: [number, number][]) => {
    eleves.slice(3).forEach((e, i) => {
      if (!scores[i]) return
      const [score, temps] = scores[i]
      const id = u(nt++)
      tentatives.push({
        id, session_id, eleve_id: e.id, langue: 'fr', debut: '2026-12-01T09:10:00Z', fin: '2026-12-01T09:15:00Z',
        score, score_max, temps_total_ms: temps, statut: 'soumise',
      })
      reponses.push({ id: u(nt++), tentative_id: id, question_id: '', choix_coches: [], statut_correction: 'auto', score_final: score, temps_ms: temps })
    })
  }
  resultats(S.preRobot, 8, [[7, 182000], [6, 150000], [6, 171000], [5, 140000], [4.5, 198000], [4, 120000], [3, 160000], [2.5, 210000]])
  resultats(S.postRobot, 8, [[8, 161000], [7.5, 139000], [7, 150000], [7, 128000], [6, 170000], [6, 115000], [5, 149000], [4.5, 190000]])

  await db.transaction('rw', db.tables, async () => {
    await db.technologie.bulkAdd([
      { id: ID.robotique, nom_fr: 'Robotique', nom_en: 'Robotics', couleur: '#e5484d' },
      { id: ID.impression3d, nom_fr: 'Impression 3D', nom_en: '3D printing', couleur: '#17a07a' },
      { id: ID.ia, nom_fr: 'Intelligence artificielle', nom_en: 'Artificial intelligence', couleur: '#7b5cd6' },
      { id: ID.iot, nom_fr: 'Internet des objets', nom_en: 'Internet of Things', couleur: '#1d8fc9' },
      { id: ID.prog, nom_fr: 'Programmation', nom_en: 'Programming', couleur: '#e8a21c' },
    ])
    await db.camp.add({
      id: ID.camp, ville_id: ID.ville, nom: 'Camp CAYSTI Lomé (démo)', date_debut: '2026-12-01', date_fin: '2026-12-05',
      lieu: 'Lomé', statut: 'en_cours', ville: 'Lomé', pays: 'Togo', pays_code: 'TG',
    })
    await db.atelier.bulkAdd([
      { id: ID.atelierRobot, camp_id: ID.camp, technologie_id: ID.robotique, titre_fr: 'Mon premier robot', titre_en: 'My first robot', image: img('robot') },
      { id: ID.atelier3d, camp_id: ID.camp, technologie_id: ID.impression3d, titre_fr: 'Imprimer en 3D', titre_en: '3D printing', image: img('imprimante3d') },
    ])
    await db.groupe.bulkAdd([
      { id: ID.groupeA, atelier_id: ID.atelierRobot, nom: 'Groupe A', date: '2026-12-01', heure_debut: '09:00', heure_fin: '12:00', salle: 'Salle 1', statut: 'en_cours' },
      { id: ID.groupeB, atelier_id: ID.atelier3d, nom: 'Groupe B', date: '2026-12-01', heure_debut: '14:00', heure_fin: '17:00', salle: 'Fab lab', statut: 'a_venir' },
    ])
    await db.competence.bulkAdd([
      { id: ID.compCapteur, technologie_id: ID.robotique, libelle_fr: 'Reconnaître un capteur', libelle_en: 'Recognise a sensor' },
      { id: ID.compActionneur, technologie_id: ID.robotique, libelle_fr: 'Reconnaître un actionneur', libelle_en: 'Recognise an actuator' },
      { id: ID.compRobot, technologie_id: ID.robotique, libelle_fr: 'Définir un robot', libelle_en: 'Define a robot' },
      { id: ID.compFabrication, technologie_id: ID.impression3d, libelle_fr: 'Comprendre la fabrication additive', libelle_en: 'Understand additive manufacturing' },
      { id: ID.compMateriau, technologie_id: ID.impression3d, libelle_fr: 'Connaître les matériaux', libelle_en: 'Know the materials' },
      { id: ID.compChaine, technologie_id: ID.impression3d, libelle_fr: 'Suivre la chaîne d’impression', libelle_en: 'Follow the printing chain' },
      { id: ID.compProjet, technologie_id: ID.impression3d, libelle_fr: 'Imaginer un objet utile', libelle_en: 'Imagine a useful object' },
    ])
    await db.question.bulkAdd(questions)
    await db.choix.bulkAdd(choix)
    await db.fiche.bulkAdd(fiches)
    await db.fiche_question.bulkAdd(liens)
    await db.session_evaluation.bulkAdd(sessions)
    await db.eleve.bulkAdd(eleves)
    await db.inscription.bulkAdd(
      eleves.flatMap((e, i) => [
        { id: u(2000 + i * 2), eleve_id: e.id, groupe_id: ID.groupeA, inscrit_le: '2026-11-20T10:00:00Z' },
        { id: u(2001 + i * 2), eleve_id: e.id, groupe_id: ID.groupeB, inscrit_le: '2026-11-20T10:00:00Z' },
      ]),
    )
    await db.ecole.bulkAdd([
      { id: ID.ecoleTokoin, nom: 'Lycée de Tokoin', type: 'public' },
      { id: ID.ecoleBe, nom: 'CEG Bè', type: 'public' },
      { id: ID.ecoleAdido, nom: 'Complexe scolaire Adidogomé', type: 'prive' },
    ])
    await db.langue.bulkAdd([
      { id: ID.langFr, libelle_fr: 'Français', libelle_en: 'French', est_autre: false, ordre: 0 },
      { id: ID.langEn, libelle_fr: 'Anglais', libelle_en: 'English', est_autre: false, ordre: 1 },
      { id: ID.langEwe, libelle_fr: 'Éwé', libelle_en: 'Ewe', est_autre: false, ordre: 2 },
      { id: ID.langMina, libelle_fr: 'Mina', libelle_en: 'Mina', est_autre: false, ordre: 3 },
      { id: ID.langKabye, libelle_fr: 'Kabyè', libelle_en: 'Kabiye', est_autre: false, ordre: 4 },
      { id: ID.langAutre, libelle_fr: 'Autre', libelle_en: 'Other', est_autre: true, ordre: 99 },
    ])
    await db.tuteur.bulkAdd(tuteurs)
    await db.eleve_tuteur.bulkAdd(eleves.map((e, i) => ({ eleve_id: e.id, tuteur_id: tuteurs[i].id, tuteur_principal: true })))
    await db.utilisateur.bulkAdd(personnel)
    await db.attribution_role.bulkAdd(roles)
    await db.groupe_formateur.bulkAdd(affectations)
    await db.tentative.bulkAdd(tentatives)
    await db.reponse.bulkAdd(reponses)
  })
}
