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
| 7 | Branchement Supabase : API SQL sécurisée, temps réel, comptes du personnel, file d'attente hors ligne, publication GitHub Pages | Fait (à tester sur le vrai projet) |

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
supabase/migrations/   Schéma (0001-0004), API SQL élève (0005), API personnel (0006), droits et données de base (0007)
supabase/tests/        Simulation de Supabase et scénario complet (scripts/tester-sql.sh)
src/data/supabase/     Clients Supabase, implémentations des contrats, file d'attente des réponses
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

Les écrans ne parlent qu'aux contrats `Repository` et `StaffRepository`. `VITE_DATA_BACKEND` choisit l'implémentation : navigateur (`local`) ou Supabase (`supabase`).

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

## Mettre en ligne avec Supabase

### Sécurité, en bref

- Le navigateur n'a accès à aucune table : RLS activée partout sans politique, privilèges retirés. Tout passe par des fonctions SQL (`security definer`) qui vérifient le rôle de l'appelant.
- Élève : session anonyme Supabase liée à son code (10 essais ratés par appareil et par 10 minutes au plus). Les bonnes réponses restent cachées jusqu'à la révélation ou la fin de la tentative.
- Personnel : compte e-mail et mot de passe. Un nouveau compte n'a aucun droit tant qu'un admin ne lui donne pas de rôle.
- Seules l'URL du projet et la clé `anon` / publishable vont dans l'application. **La clé `service_role` / secret et le mot de passe de la base ne doivent jamais être copiés dans le code, dans `.env` versionné, dans GitHub, ni envoyés par message.**

### 1. Projet Supabase

1. Créer le projet (région Europe : Francfort ou Paris).
2. **SQL Editor** : exécuter dans l'ordre, chacun en entier, `supabase/migrations/0001_schema.sql` à `0007_droits_et_donnees.sql`.
3. **Authentication > Sign In / Providers** : activer *Allow anonymous sign-ins* (connexion des élèves) et laisser *Email* activé (personnel).
4. **Authentication > URL Configuration** :
   - Site URL : `https://<compte>.github.io/<depot>/`
   - Redirect URLs : `https://<compte>.github.io/<depot>/**` et, pour le développement, `http://localhost:5173/**`
5. **Project Settings > API** : relever la Project URL et la clé `anon` / publishable.

### 2. Publication sur GitHub Pages

1. Pousser le dépôt sur GitHub (voir plus haut).
2. **Settings > Pages > Source** : « GitHub Actions ».
3. **Settings > Secrets and variables > Actions > Variables** : créer `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
4. Chaque push sur `main` lance `.github/workflows/deploy.yml` (tests, build, publication). Sans ces variables, le site publié tourne en mode démo.

### 3. Premier super-admin

1. Ouvrir le site, **Espace formateur > Créer un compte**, confirmer l'adresse par le lien reçu, se connecter et remplir son profil.
2. Dans le **SQL Editor** de Supabase (seul endroit où cette fonction est permise) :
   ```sql
   select promouvoir_super_admin('votre.adresse@exemple.com');
   ```
3. Recharger la page : les menus « Camp et élèves », « Personnel » et « À valider » apparaissent. Créer le camp, puis donner les rôles aux autres comptes depuis « Personnel ».

### Développement local contre Supabase

```bash
cp .env.example .env   # VITE_DATA_BACKEND=supabase, URL et clé anon
npm run dev
```

### Tests SQL

`scripts/tester-sql.sh` rejoue toutes les migrations sur un PostgreSQL local jetable, avec une simulation des schémas `auth` et `realtime` de Supabase, puis un scénario complet (inscription, connexion par code, tentatives, mode piloté, droits du personnel, fiches, import). Prérequis : PostgreSQL 15 ou plus avec `postgresql-contrib` ; lancer le script avec un utilisateur autorisé à exécuter `initdb` (pas root).
