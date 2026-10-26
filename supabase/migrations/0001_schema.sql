-- =====================================================================
-- Application Camp CAYSTI — Schéma de base de données (PostgreSQL / Supabase)
-- Version 1 — 26/10/2026
-- Conforme à la spécification « Application Camp CAYSTI — Modèle de données »
-- =====================================================================
-- Conventions
--   * Tous les identifiants sont des UUID (générés côté appareil possible, pour le hors-ligne).
--   * Chaque table porte cree_le / modifie_le (mis à jour par trigger).
--   * Les textes bilingues sont stockés en colonnes _fr / _en.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------
create type statut_camp        as enum ('preparation', 'en_cours', 'termine');
create type role_formateur     as enum ('principal', 'secondaire');
create type role_utilisateur   as enum ('super_admin', 'admin_camp', 'formateur', 'lecteur');
create type type_ecole         as enum ('public', 'prive');
create type sexe               as enum ('F', 'M');
create type classe             as enum ('CE1','CE2','CM1','CM2','6e','5e','4e','3e','2nde','1ere','Tle');
create type langue_interface   as enum ('fr', 'en');
create type type_fiche         as enum ('pretest', 'posttest', 'quiz', 'satisfaction');
create type mode_correction    as enum ('ia_definitive', 'ia_puis_formateur');
create type visibilite_fiche   as enum ('privee', 'partagee', 'officielle');
create type statut_validation  as enum ('brouillon', 'soumise', 'validee', 'refusee');
create type type_question      as enum ('qcm_unique', 'qcm_multiple', 'qro_ia', 'qro_qualitative', 'echelle');
create type mode_bareme        as enum ('tout_ou_rien', 'proportionnel');
create type mode_session       as enum ('libre', 'pilote');
create type statut_session     as enum ('brouillon', 'ouverte', 'fermee');
create type etape_session      as enum ('attente', 'question', 'revelation', 'classement', 'terminee');
create type statut_tentative   as enum ('en_cours', 'soumise', 'expiree');
create type statut_correction  as enum ('en_attente', 'ia', 'validee', 'modifiee', 'auto');
create type type_riasec        as enum ('R', 'I', 'A', 'S', 'E', 'C');
create type rubrique_caysti    as enum ('kit', 'mission_nova', 'communaute');
create type canal_envoi        as enum ('email', 'whatsapp');
create type statut_envoi       as enum ('en_attente', 'envoye', 'echec');

-- Trigger générique de mise à jour de modifie_le
create or replace function maj_modifie_le() returns trigger language plpgsql as $$
begin new.modifie_le := now(); return new; end $$;

-- =====================================================================
-- A. ORGANISATION
-- =====================================================================
create table pays (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  code_iso    char(2) not null unique,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now()
);

create table ville (
  id          uuid primary key default gen_random_uuid(),
  pays_id     uuid not null references pays(id),
  nom         text not null,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now(),
  unique (pays_id, nom)
);

create table camp (
  id          uuid primary key default gen_random_uuid(),
  ville_id    uuid not null references ville(id),
  nom         text not null,
  date_debut  date not null,
  date_fin    date not null,
  lieu        text,
  statut      statut_camp not null default 'preparation',
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now(),
  check (date_fin >= date_debut)
);

create table technologie (
  id          uuid primary key default gen_random_uuid(),
  nom_fr      text not null,
  nom_en      text not null,
  couleur     text,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now()
);

create table atelier (
  id              uuid primary key default gen_random_uuid(),
  camp_id         uuid not null references camp(id) on delete cascade,
  technologie_id  uuid not null references technologie(id),
  titre_fr        text not null,
  titre_en        text,
  description_fr  text,
  description_en  text,
  cree_le         timestamptz not null default now(),
  modifie_le      timestamptz not null default now()
);

create table groupe (
  id           uuid primary key default gen_random_uuid(),
  atelier_id   uuid not null references atelier(id) on delete cascade,
  nom          text not null,
  date         date not null,
  heure_debut  time not null,
  heure_fin    time not null,
  salle        text,
  cree_le      timestamptz not null default now(),
  modifie_le   timestamptz not null default now(),
  check (heure_fin > heure_debut)
);

-- =====================================================================
-- B. PERSONNES
-- =====================================================================
-- utilisateur = admins et formateurs ; lié au compte Supabase Auth
create table utilisateur (
  id                uuid primary key references auth.users(id) on delete cascade,
  nom               text not null,
  prenom            text not null,
  email             text not null unique,
  telephone         text,
  langue_interface  langue_interface not null default 'fr',
  actif             boolean not null default true,
  cree_le           timestamptz not null default now(),
  modifie_le        timestamptz not null default now()
);

create table attribution_role (
  id              uuid primary key default gen_random_uuid(),
  utilisateur_id  uuid not null references utilisateur(id) on delete cascade,
  role            role_utilisateur not null,
  camp_id         uuid references camp(id) on delete cascade, -- null = tous les camps
  cree_le         timestamptz not null default now(),
  modifie_le      timestamptz not null default now(),
  unique (utilisateur_id, role, camp_id)
);

create table groupe_formateur (
  id              uuid primary key default gen_random_uuid(),
  groupe_id       uuid not null references groupe(id) on delete cascade,
  utilisateur_id  uuid not null references utilisateur(id),
  role            role_formateur not null,
  cree_le         timestamptz not null default now(),
  modifie_le      timestamptz not null default now(),
  unique (groupe_id, utilisateur_id)
);
-- Un seul formateur principal par groupe
create unique index un_principal_par_groupe on groupe_formateur(groupe_id) where role = 'principal';

create table ecole (
  id          uuid primary key default gen_random_uuid(),
  ville_id    uuid not null references ville(id),
  nom         text not null,
  type        type_ecole,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now(),
  unique (ville_id, nom)
);

create table langue (
  id          uuid primary key default gen_random_uuid(),
  libelle_fr  text not null,
  libelle_en  text not null,
  est_autre   boolean not null default false, -- l'option « Autre »
  ordre       int not null default 0,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now()
);

-- Génération d'un code d'accès court et lisible (sans 0/O, 1/I/L)
create or replace function generer_code_acces() returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from eleve where code_acces = code);
  end loop;
  return code;
end $$;

create table eleve (
  id                uuid primary key default gen_random_uuid(),
  code_acces        text not null unique,
  nom               text not null,
  prenom            text not null,
  date_naissance    date not null,
  sexe              sexe not null,
  classe            classe not null,
  ecole_id          uuid references ecole(id),
  langue_id         uuid references langue(id),
  langue_autre      text,  -- rempli si la langue choisie est « Autre »
  langue_interface  langue_interface not null default 'fr',
  cree_le           timestamptz not null default now(),
  modifie_le        timestamptz not null default now()
);
alter table eleve alter column code_acces set default generer_code_acces();
create index eleve_identite on eleve (lower(nom), lower(prenom), date_naissance); -- détection de doublons à l'import

create table tuteur (
  id                uuid primary key default gen_random_uuid(),
  nom               text not null,
  prenom            text,
  telephone         text,
  whatsapp          text,
  email             text,
  lien              text,          -- mère, père, tuteur...
  consentement_le   timestamptz,
  consentement_mode text,          -- case cochée, autorisation signée...
  cree_le           timestamptz not null default now(),
  modifie_le        timestamptz not null default now()
);

create table eleve_tuteur (
  eleve_id           uuid not null references eleve(id) on delete cascade,
  tuteur_id          uuid not null references tuteur(id) on delete cascade,
  tuteur_principal   boolean not null default false,
  cree_le            timestamptz not null default now(),
  primary key (eleve_id, tuteur_id)
);
create unique index un_tuteur_principal on eleve_tuteur(eleve_id) where tuteur_principal;

create table inscription (
  id          uuid primary key default gen_random_uuid(),
  eleve_id    uuid not null references eleve(id) on delete cascade,
  groupe_id   uuid not null references groupe(id) on delete cascade,
  inscrit_le  timestamptz not null default now(),
  present     boolean,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now(),
  unique (eleve_id, groupe_id)
);

create table lot_import (
  id              uuid primary key default gen_random_uuid(),
  utilisateur_id  uuid not null references utilisateur(id),
  camp_id         uuid references camp(id),
  fichier         text not null,
  importe_le      timestamptz not null default now(),
  lignes_ok       int not null default 0,
  lignes_erreur   int not null default 0,
  rapport         jsonb,
  cree_le         timestamptz not null default now()
);

-- =====================================================================
-- C. BANQUE D'ÉVALUATIONS
-- =====================================================================
create table competence (
  id              uuid primary key default gen_random_uuid(),
  technologie_id  uuid not null references technologie(id),
  libelle_fr      text not null,
  libelle_en      text,
  description     text,
  cree_le         timestamptz not null default now(),
  modifie_le      timestamptz not null default now()
);

create table fiche (
  id                 uuid primary key default gen_random_uuid(),
  titre_fr           text not null,
  titre_en           text,
  type               type_fiche not null,
  technologie_id     uuid references technologie(id),
  mode_correction    mode_correction not null default 'ia_definitive',
  visibilite         visibilite_fiche not null default 'privee',
  statut_validation  statut_validation not null default 'brouillon',
  fiche_jumelle_id   uuid references fiche(id), -- pour un post-test : son prétest
  auteur_id          uuid not null references utilisateur(id),
  validee_par        uuid references utilisateur(id),
  validee_le         timestamptz,
  version            int not null default 1,
  cree_le            timestamptz not null default now(),
  modifie_le         timestamptz not null default now(),
  -- une fiche officielle doit avoir été validée par un admin
  check (visibilite <> 'officielle' or (statut_validation = 'validee' and validee_par is not null))
);

create table question (
  id                    uuid primary key default gen_random_uuid(),
  type                  type_question not null,
  enonce_fr             text not null,
  enonce_en             text,
  image                 text,          -- chemin dans Supabase Storage
  duree_secondes        int not null default 30 check (duree_secondes > 0),
  points                numeric(6,2) not null default 1 check (points >= 0),
  mode_bareme           mode_bareme not null default 'tout_ou_rien', -- utile pour qcm_multiple
  reponse_attendue_fr   text,          -- qro_ia
  reponse_attendue_en   text,
  criteres_correction   text,          -- qro_ia
  competence_id         uuid references competence(id),
  question_jumelle_id   uuid references question(id),
  auteur_id             uuid not null references utilisateur(id),
  cree_le               timestamptz not null default now(),
  modifie_le            timestamptz not null default now()
);

create table choix (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references question(id) on delete cascade,
  texte_fr     text not null,
  texte_en     text,
  image        text,
  est_correct  boolean not null default false,
  ordre        int not null default 0,
  cree_le      timestamptz not null default now(),
  modifie_le   timestamptz not null default now()
);

create table fiche_question (
  fiche_id     uuid not null references fiche(id) on delete cascade,
  question_id  uuid not null references question(id),
  ordre        int not null,
  primary key (fiche_id, question_id),
  unique (fiche_id, ordre)
);

-- =====================================================================
-- D. PASSATION
-- =====================================================================
create table session_evaluation (
  id                   uuid primary key default gen_random_uuid(),
  fiche_id             uuid not null references fiche(id),
  groupe_id            uuid not null references groupe(id) on delete cascade,
  mode                 mode_session not null default 'libre',
  mode_correction      mode_correction not null,  -- repris de la fiche, modifiable
  statut               statut_session not null default 'brouillon',
  classement_affiche   boolean not null default true,
  etape                etape_session not null default 'attente',  -- mode piloté
  question_courante_id uuid references question(id),               -- mode piloté
  question_lancee_le   timestamptz,                                -- chrono commun
  ouverte_le           timestamptz,
  fermee_le            timestamptz,
  lancee_par           uuid references utilisateur(id),
  cree_le              timestamptz not null default now(),
  modifie_le           timestamptz not null default now()
);

create table participant_session (
  session_id  uuid not null references session_evaluation(id) on delete cascade,
  eleve_id    uuid not null references eleve(id) on delete cascade,
  arrive_le   timestamptz not null default now(),
  connecte    boolean not null default true,
  primary key (session_id, eleve_id)
);

create table tentative (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references session_evaluation(id) on delete cascade,
  eleve_id        uuid not null references eleve(id) on delete cascade,
  langue          langue_interface not null,
  debut           timestamptz not null default now(),
  fin             timestamptz,
  score           numeric(8,2),
  score_max       numeric(8,2),
  temps_total_ms  bigint,
  statut          statut_tentative not null default 'en_cours',
  synchronisee_le timestamptz,
  cree_le         timestamptz not null default now(),
  modifie_le      timestamptz not null default now(),
  unique (session_id, eleve_id)  -- une seule tentative par élève et par session
);

create table reponse (
  id                 uuid primary key default gen_random_uuid(),
  tentative_id       uuid not null references tentative(id) on delete cascade,
  question_id        uuid not null references question(id),
  choix_coches       uuid[] not null default '{}',
  texte              text,
  score_ia           numeric(6,2),
  justification_ia   text,
  score_final        numeric(6,2),
  statut_correction  statut_correction not null default 'en_attente',
  corrigee_par       uuid references utilisateur(id),
  temps_ms           int,
  cree_le            timestamptz not null default now(),
  modifie_le         timestamptz not null default now(),
  unique (tentative_id, question_id)
);

-- Score d'un QCM (pas de pénalité pour une mauvaise case)
create or replace function score_qcm(p_question uuid, p_coches uuid[]) returns numeric language sql stable as $$
  with q as (select points, mode_bareme, type from question where id = p_question),
       bons as (select array_agg(id) ids, count(*) n from choix where question_id = p_question and est_correct)
  select case
    when q.type = 'qcm_unique' then
      case when p_coches = bons.ids then q.points else 0 end
    when q.mode_bareme = 'tout_ou_rien' then
      case when p_coches @> bons.ids and bons.ids @> p_coches then q.points else 0 end
    else -- proportionnel : bonnes cases cochées / bonnes cases attendues
      round(q.points * (select count(*) from unnest(p_coches) c where c = any(bons.ids))::numeric / nullif(bons.n, 0), 2)
  end
  from q, bons
$$;

-- Classement d'une session : top 10, score décroissant puis temps croissant
create or replace view classement_session as
select
  t.session_id,
  t.eleve_id,
  e.prenom || ' ' || upper(left(e.nom, 1)) || '.' as nom_affiche,
  coalesce(t.score, 0) as score,
  t.temps_total_ms,
  rank() over (partition by t.session_id order by coalesce(t.score, 0) desc, t.temps_total_ms asc nulls last) as rang
from tentative t
join eleve e on e.id = t.eleve_id
where t.statut in ('soumise', 'expiree');
-- Usage : select * from classement_session where session_id = $1 and rang <= 10 order by rang;

-- =====================================================================
-- E. BOUSSOLE RIASEC
-- =====================================================================
create table riasec_item (
  numero     int primary key check (numero between 1 and 48),
  type       type_riasec not null,
  enonce_fr  text not null,
  enonce_en  text
);

create table riasec_passation (
  id            uuid primary key default gen_random_uuid(),
  eleve_id      uuid not null references eleve(id) on delete cascade,
  camp_id       uuid references camp(id),
  langue        langue_interface not null,
  date          timestamptz not null default now(),
  score_r int, score_i int, score_a int, score_s int, score_e int, score_c int,
  code_holland  char(3),
  cree_le       timestamptz not null default now(),
  modifie_le    timestamptz not null default now()
);

create table riasec_reponse (
  passation_id  uuid not null references riasec_passation(id) on delete cascade,
  item_numero   int not null references riasec_item(numero),
  valeur        smallint not null,
  primary key (passation_id, item_numero)
);

-- =====================================================================
-- F. FICHE FINALE ET ENVOIS
-- =====================================================================
create table contenu_caysti (
  id          uuid primary key default gen_random_uuid(),
  rubrique    rubrique_caysti not null,
  camp_id     uuid references camp(id) on delete cascade, -- null = contenu par défaut
  titre_fr    text not null,
  titre_en    text,
  texte_fr    text,
  texte_en    text,
  lien        text,
  image       text,   -- image ou QR code (Storage)
  ordre       int not null default 0,
  actif       boolean not null default true,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now()
);

create table rapport_final (
  id                   uuid primary key default gen_random_uuid(),
  eleve_id             uuid not null references eleve(id) on delete cascade,
  camp_id              uuid not null references camp(id),
  riasec_passation_id  uuid references riasec_passation(id),
  langue               langue_interface not null,
  pdf                  text,  -- chemin dans Storage
  genere_le            timestamptz not null default now(),
  cree_le              timestamptz not null default now()
);

create table envoi (
  id                uuid primary key default gen_random_uuid(),
  rapport_final_id  uuid not null references rapport_final(id) on delete cascade,
  tuteur_id         uuid references tuteur(id),
  canal             canal_envoi not null,
  destinataire      text not null,
  statut            statut_envoi not null default 'en_attente',
  envoye_par        uuid references utilisateur(id), -- null si l'élève l'envoie lui-même
  envoye_le         timestamptz,
  erreur            text,
  cree_le           timestamptz not null default now()
);

-- =====================================================================
-- Triggers modifie_le
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'pays','ville','camp','technologie','atelier','groupe','utilisateur','attribution_role',
    'groupe_formateur','ecole','langue','eleve','tuteur','inscription','competence','fiche',
    'question','choix','session_evaluation','tentative','reponse','riasec_passation','contenu_caysti'
  ] loop
    execute format('create trigger %I_modifie_le before update on %I for each row execute function maj_modifie_le()', t, t);
  end loop;
end $$;

-- =====================================================================
-- Index utiles aux tableaux de bord
-- =====================================================================
create index on atelier (camp_id);
create index on atelier (technologie_id);
create index on groupe (atelier_id);
create index on inscription (groupe_id);
create index on inscription (eleve_id);
create index on eleve (ecole_id);
create index on session_evaluation (groupe_id);
create index on session_evaluation (fiche_id);
create index on tentative (session_id);
create index on tentative (eleve_id);
create index on reponse (tentative_id);
create index on reponse (question_id);
create index on question (competence_id);
create index on riasec_passation (eleve_id);

-- =====================================================================
-- Données de départ
-- =====================================================================
insert into technologie (nom_fr, nom_en) values
  ('Robotique', 'Robotics'), ('Intelligence artificielle', 'Artificial intelligence'),
  ('Internet des objets', 'Internet of Things'), ('Programmation', 'Programming');

-- À FAIRE (lot suivant) : politiques RLS par rôle et portée, accès élève par code,
-- insertion des 48 items RIASEC depuis la Boussole existante.
