# Camp CAYSTI

Application web des camps de formation CAYSTI aux nouvelles technologies (enfants du CE1 à la Terminale) : inscription, prétests, quiz, post-tests, Boussole RIASEC et fiche de fin de camp.

La spécification du modèle de données est dans le document « Application Camp CAYSTI — Modèle de données ».

## État d'avancement

| Lot | Contenu | État |
| --- | --- | --- |
| 1 | Schéma de base (PostgreSQL / Supabase) | Fait |
| 1 | Parcours élève : connexion par code, ateliers du jour, tests chronométrés, barème, top 10, progression pré/post, FR/EN, hors ligne | Fait (stockage local) |
| 2 | Espace formateur et admin : pilotage des ateliers, résultats en direct, éditeur et validation des fiches, gestion du camp, import Excel | Fait (stockage local) |
| 3 | Mode piloté (type Kahoot) : salle d'attente, questions au rythme du formateur, chrono commun, révélation, classements, podium | Fait (stockage local) |
| 4 | Boussole RIASEC intégrée | À faire |
| 5 | Correction IA des QRO, fiche finale PDF, envoi email / WhatsApp | À faire |
| 6 | Tableaux de bord multicritères | À faire |
| 7 | Branchement Supabase et synchronisation hors ligne | À faire |

## Démarrer

Prérequis : Node.js 20 ou plus.

```bash
npm install
cp .env.example .env   # VITE_DATA_BACKEND=local par défaut
npm run dev            # http://localhost:5173
```

En mode `local`, l'application crée des données de démonstration dans le navigateur.

- Espace élève : codes `AMA234`, `YAW567`, `KEM789`.
- Espace formateur (lien en bas de l'écran de connexion) : comptes de démo Arielle Kitio (super-admin), Edem Amouzou (admin du camp), Komla Agbeko (formateur robotique), Akossiwa Dzifa (formatrice 3D).

```bash
npm test           # tests unitaires et parcours élève
npm run build      # version de production dans dist/ (PWA installable, fonctionne hors ligne)
npm run lint
```

## Organisation du code

```
supabase/migrations/   Schéma SQL de référence (tables, contraintes, score_qcm, classement_session)
src/types.ts           Types du domaine, mêmes noms de champs que les tables SQL
src/data/              Accès aux données
  repository.ts        Contrat utilisé par les écrans
  localRepository.ts   Implémentation navigateur (IndexedDB / Dexie), hors ligne
  seed.ts              Données de démonstration
src/lib/               Règles métier pures : barème (scoring.ts), classement (ranking.ts)
src/i18n/              Textes FR / EN
src/data/staffRepository.ts       Contrat de l'espace formateur
src/data/localStaffRepository.ts  Implémentation navigateur
src/lib/droits.ts      Qui peut faire quoi (formateur, admin de camp, super-admin)
src/lib/importEleves.ts  Lecture tolérante des fichiers Excel d'inscription
src/lib/validationFiche.ts  Contrôles d'une fiche avant enregistrement et soumission
src/pages/eleve/       Écrans élève
src/staff/             Espace formateur (chargé à la demande)
src/components/        En-tête, chronomètre
```

Les écrans ne parlent qu'au contrat `Repository`. Brancher Supabase consistera à écrire `supabaseRepository.ts` et à passer `VITE_DATA_BACKEND=supabase`, sans toucher aux écrans.

## Règles métier implémentées

- **Code élève** : 6 caractères, permanent ; saisie insensible à la casse et aux espaces.
- **QCM multiple** : « tout ou rien » ou « proportionnel », jamais de pénalité. Les règles sont écrites deux fois (SQL `score_qcm` et `src/lib/scoring.ts`) ; les tests vérifient les mêmes cas.
- **Chronomètre par question** : à expiration, la réponse en cours est enregistrée avec le temps complet et la question suivante s'affiche.
- **QRO corrigée par IA** : comptée dans le score maximum, en attente de correction ; le score affiché le signale.
- **Classement** : top 10, « Prénom + initiale », score puis temps total. La vitesse ne rapporte aucun point.
- **Une tentative par session** ; une tentative interrompue reprend à la première question sans réponse.
- **Tablettes partagées** : l'élève connecté est oublié à la fermeture de l'onglet.
- **Atelier verrouillé** tant que le formateur ne l'a pas démarré (contrôlé aussi en base, migration 0003) ; activité grisée tant qu'elle n'est pas ouverte.
- **Fiches** : brouillon privé ou partagé → soumise → validée (officielle) ou renvoyée avec remarque. Une fiche officielle ou déjà passée par des élèves ne se modifie plus : on la duplique.
- **Programmation** : un formateur programme les fiches officielles, ou ses propres brouillons pour les essayer avec son groupe.
- **Mode piloté** : le formateur lance chaque question ; le chrono de tous les écrans part de l'heure de lancement. Une seule réponse par question, refusée après la fin du chrono (marge de 1,5 s) ou après la révélation. Une question manquée compte pour toute sa durée dans le départage. Les retardataires peuvent rejoindre la partie en cours. En local, les écrans se synchronisent entre onglets du même navigateur ; avec Supabase, ce sera un canal temps réel (même contrat `surveillerSession`).
- **Import Excel** : aperçu ligne par ligne avant tout enregistrement ; élèves déjà connus rattachés (même code), doublons du fichier signalés, écoles inconnues créées une seule fois.

## Mettre le projet sur GitHub

Le dépôt git est déjà initialisé (branche `main`). Aucun secret n'est versionné : les clés vont dans `.env`, ignoré par git.

```bash
git remote add origin git@github.com:<organisation>/camp-caysti.git
git push -u origin main
```

## Créer le projet Supabase (lot 7)

1. Créer un projet sur supabase.com, en choisissant la région en tenant compte des règles de protection des données des pays concernés.
2. Dans l'éditeur SQL, exécuter `supabase/migrations/0001_schema.sql`.
3. Copier l'URL et la clé `anon` (Settings > API) dans `.env`.
