-- =====================================================================
-- 0005 — API sécurisée pour Supabase
-- ---------------------------------------------------------------------
-- Principe : les tablettes n'accèdent JAMAIS directement aux tables.
-- Toutes les lectures et écritures passent par les fonctions ci-dessous
-- (appelées avec supabase.rpc). Chaque fonction vérifie qui appelle :
--   * un élève      = session anonyme Supabase rattachée à un code élève
--   * le personnel  = compte e-mail lié à une ligne de la table utilisateur
-- Les élèves ne reçoivent jamais les bonnes réponses avant leur révélation,
-- et ne peuvent pas modifier un score : la notation se fait ici.
--
-- Erreurs renvoyées au client (message de l'exception) :
--   * un code métier : code_inconnu, deja_soumise, session_fermee, ...
--   * « droits:<message pour l'utilisateur> » pour un refus de droits
-- =====================================================================

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------
-- Ajustements du schéma
-- ---------------------------------------------------------------------
-- Une école peut être créée depuis un import Excel sans ville connue
alter table ecole alter column ville_id drop not null;

-- Appareil (session anonyme) → élève connecté avec son code
create table appareil_eleve (
  auth_uid     uuid primary key,
  eleve_id     uuid not null references eleve(id) on delete cascade,
  connecte_le  timestamptz not null default now()
);

-- Essais de code, pour freiner qui tenterait de deviner les codes
create table essai_code (
  id        bigint generated always as identity primary key,
  auth_uid  uuid not null,
  reussi    boolean not null,
  essaye_le timestamptz not null default now()
);
create index on essai_code (auth_uid, essaye_le);

-- Aucun accès direct aux tables ni aux vues depuis l'API : tout passe par les fonctions
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
-- Par défaut, aucune fonction n'est appelable sans session ; on ouvre ensuite la liste en fin de fichier
alter default privileges in schema public revoke execute on functions from public;

-- ---------------------------------------------------------------------
-- Qui appelle ?
-- ---------------------------------------------------------------------
create or replace function est_anonyme() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

create or replace function eleve_courant() returns uuid
language sql stable security definer set search_path = public as $$
  select eleve_id from appareil_eleve where auth_uid = auth.uid()
$$;

create or replace function moi() returns uuid
language sql stable security definer set search_path = public as $$
  select u.id from utilisateur u where u.id = auth.uid() and u.actif and not est_anonyme()
$$;

create or replace function est_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from attribution_role r where r.utilisateur_id = moi() and r.role = 'super_admin')
$$;

create or replace function est_admin_camp(p_camp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select est_super_admin() or exists (
    select 1 from attribution_role r
    where r.utilisateur_id = moi() and r.role = 'admin_camp' and (r.camp_id is null or r.camp_id = p_camp))
$$;

create or replace function est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select est_super_admin() or exists (select 1 from attribution_role r where r.utilisateur_id = moi() and r.role = 'admin_camp')
$$;

create or replace function camp_du_groupe(p_groupe uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select a.camp_id from groupe g join atelier a on a.id = g.atelier_id where g.id = p_groupe
$$;

-- Le formateur affecté au groupe (principal ou secondaire) ou un admin du camp
create or replace function peut_piloter(p_groupe uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select moi() is not null and (
    est_admin_camp(camp_du_groupe(p_groupe))
    or exists (select 1 from groupe_formateur gf where gf.groupe_id = p_groupe and gf.utilisateur_id = moi()))
$$;

create or replace function eleve_inscrit(p_groupe uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from inscription i where i.groupe_id = p_groupe and i.eleve_id = eleve_courant())
$$;

create or replace function exiger_personnel() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := moi();
begin
  if v is null then raise exception 'droits:Connectez-vous avec un compte du personnel'; end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Utilitaires
-- ---------------------------------------------------------------------
create or replace function normaliser(t text) returns text
language sql stable set search_path = public, extensions as $$
  select trim(regexp_replace(lower(extensions.unaccent(coalesce(t, ''))), '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function ordre_deroule(t type_fiche) returns int
language sql immutable as $$
  select case t when 'pretest' then 0 when 'quiz' then 1 when 'posttest' then 2 else 3 end
$$;

create or replace function est_notee(t type_question) returns boolean
language sql immutable as $$
  select t in ('qcm_unique', 'qcm_multiple', 'qro_ia')
$$;

-- Un groupe en JSON, avec les heures au format HH:MM attendu par l'interface
create or replace function j_groupe(g groupe) returns jsonb
language sql stable as $$
  select to_jsonb(g) || jsonb_build_object('heure_debut', to_char(g.heure_debut, 'HH24:MI'), 'heure_fin', to_char(g.heure_fin, 'HH24:MI'))
$$;

create or replace function j_detail_session(p_session uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('session', to_jsonb(s), 'fiche', to_jsonb(f), 'groupe', j_groupe(g), 'atelier', to_jsonb(a), 'technologie', to_jsonb(t))
  from session_evaluation s
  join fiche f on f.id = s.fiche_id
  join groupe g on g.id = s.groupe_id
  join atelier a on a.id = g.atelier_id
  join technologie t on t.id = a.technologie_id
  where s.id = p_session
$$;

-- Une question avec ses choix. Sans p_reveler, les bonnes réponses et le corrigé sont masqués.
create or replace function j_question(q question, p_ordre int, p_reveler boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select (to_jsonb(q) - case when p_reveler then '{}'::text[] else array['reponse_attendue_fr', 'reponse_attendue_en', 'criteres_correction'] end)
    || jsonb_build_object('ordre', p_ordre, 'choix', coalesce((
      select jsonb_agg(case when p_reveler then to_jsonb(c) else to_jsonb(c) || '{"est_correct": false}' end order by c.ordre)
      from choix c where c.question_id = q.id), '[]'))
$$;

-- Questions d'une fiche, dans l'ordre (index 0-based) ; p_reveles = index jusqu'auquel les réponses sont visibles
create or replace function j_questions(p_fiche uuid, p_reveles int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(j_question(q, x.idx, x.idx <= p_reveles) order by x.idx), '[]')
  from (select fq.question_id, (row_number() over (order by fq.ordre) - 1)::int as idx from fiche_question fq where fq.fiche_id = p_fiche) x
  join question q on q.id = x.question_id
$$;

-- Notation d'une réponse (mêmes règles que src/lib/scoring.ts)
create or replace function noter(p_question uuid, p_coches uuid[]) returns table (score_final numeric, statut statut_correction)
language sql stable security definer set search_path = public as $$
  select case when q.type in ('qcm_unique', 'qcm_multiple') then score_qcm(q.id, coalesce(p_coches, '{}')) end,
         case when q.type = 'qro_ia' then 'en_attente'::statut_correction else 'auto'::statut_correction end
  from question q where q.id = p_question
$$;

-- score_qcm de 0001, rendu insensible à l'ordre des cases et aux doublons pour le QCM unique
create or replace function score_qcm(p_question uuid, p_coches uuid[]) returns numeric
language sql stable security definer set search_path = public as $$
  with q as (select points, mode_bareme, type from question where id = p_question),
       bons as (select coalesce(array_agg(id), '{}') ids, count(*) n from choix where question_id = p_question and est_correct),
       coches as (select coalesce(array_agg(distinct c), '{}') ids from unnest(p_coches) c)
  select case
    when bons.n = 0 then 0
    when q.type = 'qcm_unique' or q.mode_bareme = 'tout_ou_rien' then
      case when coches.ids @> bons.ids and bons.ids @> coches.ids then q.points else 0 end
    else round(q.points * (select count(*) from unnest(coches.ids) c where c = any(bons.ids))::numeric / bons.n, 2)
  end
  from q, bons, coches
$$;

-- Prévient les écrans qu'une session a changé (canal temps réel « session:<id> »).
-- Le message ne contient aucune donnée : chaque écran relit l'état par les fonctions ci-dessous.
create or replace function notifier_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send(jsonb_build_object('a', now()), 'changement', 'session:' || p_session, false);
exception when others then
  null; -- sans temps réel, les écrans se rafraîchissent aussi régulièrement
end $$;

create or replace function trg_notifier() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_session uuid;
begin
  if tg_table_name = 'session_evaluation' then v_session := new.id;
  elsif tg_table_name in ('participant_session', 'tentative') then v_session := new.session_id;
  elsif tg_table_name = 'reponse' then select t.session_id into v_session from tentative t where t.id = new.tentative_id;
  end if;
  if v_session is not null then perform notifier_session(v_session); end if;
  return new;
end $$;

create trigger notifier after insert or update on session_evaluation for each row execute function trg_notifier();
create trigger notifier after insert or update on participant_session for each row execute function trg_notifier();
create trigger notifier after insert or update on tentative for each row execute function trg_notifier();
create trigger notifier after insert or update on reponse for each row execute function trg_notifier();

-- =====================================================================
-- ÉLÈVES
-- =====================================================================

create or replace function connexion_eleve(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_eleve eleve;
begin
  if auth.uid() is null then raise exception 'code_inconnu'; end if;
  if (select count(*) from essai_code where auth_uid = auth.uid() and not reussi and essaye_le > now() - interval '10 minutes') >= 10 then
    raise exception 'trop_essais';
  end if;
  select * into v_eleve from eleve where code_acces = v_code;
  insert into essai_code (auth_uid, reussi) values (auth.uid(), v_eleve.id is not null);
  if v_eleve.id is null then return null; end if;
  insert into appareil_eleve (auth_uid, eleve_id) values (auth.uid(), v_eleve.id)
    on conflict (auth_uid) do update set eleve_id = excluded.eleve_id, connecte_le = now();
  return jsonb_strip_nulls(to_jsonb(v_eleve));
end $$;

create or replace function changer_langue(p_langue langue_interface) returns void
language sql security definer set search_path = public as $$
  update eleve set langue_interface = p_langue where id = eleve_courant()
$$;

create or replace function ateliers_eleve() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_eleve uuid := eleve_courant();
begin
  if v_eleve is null then raise exception 'code_inconnu'; end if;
  return jsonb_strip_nulls(coalesce((
    select jsonb_agg(x.j order by x.cle) from (
      select g.date::text || ' ' || to_char(g.heure_debut, 'HH24:MI') as cle,
        jsonb_build_object(
          'atelier', to_jsonb(a), 'groupe', j_groupe(g), 'technologie', to_jsonb(t),
          'activites', coalesce((
            select jsonb_agg(
              j_detail_session(s.id) || jsonb_build_object(
                'nb_questions', (select count(*) from fiche_question fq where fq.fiche_id = s.fiche_id),
                'tentative', (select to_jsonb(tt) from tentative tt where tt.session_id = s.id and tt.eleve_id = v_eleve))
              order by ordre_deroule(f.type), s.cree_le)
            from session_evaluation s join fiche f on f.id = s.fiche_id
            where s.groupe_id = g.id), '[]')) as j
      from inscription i
      join groupe g on g.id = i.groupe_id
      join atelier a on a.id = g.atelier_id
      join camp c on c.id = a.camp_id
      join technologie t on t.id = a.technologie_id
      where i.eleve_id = v_eleve and c.statut <> 'termine') x), '[]'));
end $$;

create or replace function charger_session(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s session_evaluation;
  v_personnel boolean;
begin
  select * into s from session_evaluation where id = p_session;
  if s.id is null then raise exception 'session_fermee'; end if;
  v_personnel := peut_piloter(s.groupe_id);
  if not v_personnel and not eleve_inscrit(s.groupe_id) then raise exception 'non_inscrit'; end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'detail', j_detail_session(p_session),
    'questions', j_questions(s.fiche_id, case when v_personnel then 100000 else -1 end)));
end $$;

create or replace function demarrer_tentative(p_session uuid, p_langue langue_interface) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_eleve uuid := eleve_courant();
  s session_evaluation;
  t tentative;
begin
  select * into s from session_evaluation where id = p_session;
  if s.id is null then raise exception 'session_fermee'; end if;
  if (select statut from groupe where id = s.groupe_id) <> 'en_cours' then raise exception 'atelier_inactif'; end if;
  if s.statut <> 'ouverte' then raise exception 'session_fermee'; end if;
  if s.mode = 'pilote' then raise exception 'session_pilotee'; end if;
  if v_eleve is null or not eleve_inscrit(s.groupe_id) then raise exception 'non_inscrit'; end if;
  select * into t from tentative where session_id = p_session and eleve_id = v_eleve;
  if t.id is not null and t.statut <> 'en_cours' then raise exception 'deja_soumise'; end if;
  if t.id is null then
    insert into tentative (session_id, eleve_id, langue) values (p_session, v_eleve, p_langue) returning * into t;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('tentative', to_jsonb(t), 'reponses',
    coalesce((select jsonb_agg(to_jsonb(r)) from reponse r where r.tentative_id = t.id), '[]')));
end $$;

-- Tentative de l'élève connecté, verrouillée pour modification
create or replace function ma_tentative(p_tentative uuid) returns tentative
language plpgsql security definer set search_path = public as $$
declare t tentative;
begin
  select * into t from tentative where id = p_tentative and eleve_id = eleve_courant() for update;
  if t.id is null then raise exception 'non_inscrit'; end if;
  return t;
end $$;

create or replace function ecrire_reponse(p_tentative uuid, p_question uuid, p_choix uuid[], p_texte text, p_temps_ms int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r reponse;
  n record;
begin
  select * into n from noter(p_question, p_choix);
  insert into reponse (tentative_id, question_id, choix_coches, texte, temps_ms, score_final, statut_correction)
  values (p_tentative, p_question, coalesce(p_choix, '{}'), nullif(trim(coalesce(p_texte, '')), ''), greatest(0, p_temps_ms), n.score_final, n.statut)
  on conflict (tentative_id, question_id) do update
    set choix_coches = excluded.choix_coches, texte = excluded.texte, temps_ms = excluded.temps_ms,
        score_final = excluded.score_final, statut_correction = excluded.statut_correction
  returning * into r;
  return jsonb_strip_nulls(to_jsonb(r));
end $$;

create or replace function enregistrer_reponse(p_tentative uuid, p_question uuid, p_choix uuid[], p_texte text, p_temps_ms int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t tentative := ma_tentative(p_tentative);
  s session_evaluation;
  v_duree int;
begin
  if t.statut <> 'en_cours' then raise exception 'deja_soumise'; end if;
  select * into s from session_evaluation where id = t.session_id;
  if s.mode = 'pilote' then raise exception 'session_pilotee'; end if;
  select q.duree_secondes into v_duree from fiche_question fq join question q on q.id = fq.question_id
    where fq.fiche_id = s.fiche_id and fq.question_id = p_question;
  if v_duree is null then raise exception 'hors_question'; end if;
  return ecrire_reponse(p_tentative, p_question, p_choix, p_texte, least(coalesce(p_temps_ms, 0), v_duree * 1000));
end $$;

-- Totaux d'une tentative : score, score max, temps, réponses écrites en attente
create or replace function totaux_tentative(p_tentative uuid, p_pilote boolean) returns table (score numeric, score_max numeric, temps bigint, en_attente int)
language sql stable security definer set search_path = public as $$
  with t as (select * from tentative where id = p_tentative),
       s as (select * from session_evaluation where id = (select session_id from t)),
       qs as (
         select q.*, (row_number() over (order by fq.ordre) - 1)::int as idx
         from fiche_question fq join question q on q.id = fq.question_id where fq.fiche_id = (select fiche_id from s)),
       courant as (select coalesce((select idx from qs where id = (select question_courante_id from s)), -1) as idx)
  select
    coalesce((select round(sum(r.score_final), 2) from reponse r where r.tentative_id = p_tentative), 0),
    coalesce((select sum(points) from qs where est_notee(type)), 0),
    case when p_pilote then
      -- mode piloté : une question lancée et sans réponse compte pour toute sa durée
      coalesce((select sum(coalesce(r.temps_ms, qs.duree_secondes * 1000)) from qs left join reponse r on r.tentative_id = p_tentative and r.question_id = qs.id
                where qs.idx <= (select idx from courant)), 0)
    else coalesce((select sum(r.temps_ms) from reponse r where r.tentative_id = p_tentative), 0) end,
    (select count(*)::int from reponse r where r.tentative_id = p_tentative and r.statut_correction = 'en_attente')
$$;

create or replace function soumettre_tentative(p_tentative uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t tentative := ma_tentative(p_tentative);
  x record;
begin
  select * into x from totaux_tentative(p_tentative, false);
  -- envoi répété (réseau coupé puis rétabli) : on renvoie le résultat sans rien changer
  if t.statut = 'en_cours' then
    update tentative set statut = 'soumise', fin = now(), score = x.score, score_max = x.score_max, temps_total_ms = x.temps
      where id = p_tentative returning * into t;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('tentative', to_jsonb(t), 'en_attente', x.en_attente));
end $$;

create or replace function tentative_de(p_session uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object('tentative', to_jsonb(t), 'en_attente',
    (select count(*) from reponse r where r.tentative_id = t.id and r.statut_correction = 'en_attente')))
  from tentative t where t.session_id = p_session and t.eleve_id = eleve_courant()
$$;

create or replace function progression(p_session uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(f.type, jsonb_build_object('score', coalesce(t.score, 0), 'score_max', coalesce(t.score_max, 0))), '{}')
  from session_evaluation s0
  join session_evaluation s on s.groupe_id = s0.groupe_id
  join fiche f on f.id = s.fiche_id and f.type in ('pretest', 'posttest')
  join tentative t on t.session_id = s.id and t.eleve_id = eleve_courant() and t.statut <> 'en_cours'
  where s0.id = p_session
$$;

-- Classement final d'une session (top N) : score décroissant, puis temps croissant
create or replace function classement(p_session uuid, p_limite int default 10) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s session_evaluation;
begin
  select * into s from session_evaluation where id = p_session;
  if s.id is null then return '[]'; end if;
  if not peut_piloter(s.groupe_id) and not (eleve_inscrit(s.groupe_id) and (s.classement_affiche or s.mode = 'pilote')) then
    return '[]';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('rang', x.rang, 'eleve_id', x.eleve_id, 'nom_affiche', x.nom_affiche,
                     'score', x.score, 'temps_total_ms', x.temps) order by x.rang, x.nom_affiche)
    from (
      select t.eleve_id, e.prenom || ' ' || upper(left(e.nom, 1)) || '.' as nom_affiche,
             coalesce(t.score, 0) as score, t.temps_total_ms as temps,
             rank() over (order by coalesce(t.score, 0) desc, t.temps_total_ms asc nulls last)::int as rang
      from tentative t join eleve e on e.id = t.eleve_id
      where t.session_id = p_session and t.statut in ('soumise', 'expiree')
      order by rang limit p_limite) x), '[]');
end $$;

-- ---------------------------------------------------------------------
-- Mode piloté (élève)
-- ---------------------------------------------------------------------
create or replace function rejoindre_pilote(p_session uuid, p_langue langue_interface) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_eleve uuid := eleve_courant();
  s session_evaluation;
  t tentative;
begin
  select * into s from session_evaluation where id = p_session;
  if s.id is null then raise exception 'session_fermee'; end if;
  if s.mode <> 'pilote' then raise exception 'pas_pilote'; end if;
  if (select statut from groupe where id = s.groupe_id) <> 'en_cours' then raise exception 'atelier_inactif'; end if;
  if s.statut <> 'ouverte' or s.etape = 'terminee' then raise exception 'session_fermee'; end if;
  if v_eleve is null or not eleve_inscrit(s.groupe_id) then raise exception 'non_inscrit'; end if;
  insert into participant_session (session_id, eleve_id) values (p_session, v_eleve)
    on conflict (session_id, eleve_id) do update set connecte = true;
  select * into t from tentative where session_id = p_session and eleve_id = v_eleve;
  if t.id is null then
    insert into tentative (session_id, eleve_id, langue) values (p_session, v_eleve, p_langue) returning * into t;
  end if;
  return jsonb_strip_nulls(to_jsonb(t));
end $$;

-- Le temps de réponse est mesuré par le serveur, depuis le lancement de la question :
-- l'horloge des tablettes n'entre pas en compte.
create or replace function repondre_pilote(p_tentative uuid, p_question uuid, p_choix uuid[], p_texte text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t tentative := ma_tentative(p_tentative);
  s session_evaluation;
  v_duree int;
  v_ecoule int;
begin
  if t.statut <> 'en_cours' then raise exception 'deja_soumise'; end if;
  select * into s from session_evaluation where id = t.session_id;
  if s.mode <> 'pilote' then raise exception 'pas_pilote'; end if;
  if s.etape <> 'question' or s.question_courante_id is distinct from p_question or s.question_lancee_le is null then
    raise exception 'hors_question';
  end if;
  select duree_secondes into v_duree from question where id = p_question;
  v_ecoule := (extract(epoch from (now() - s.question_lancee_le)) * 1000)::int;
  if v_ecoule > v_duree * 1000 + 1500 then raise exception 'hors_question'; end if;
  if exists (select 1 from reponse where tentative_id = p_tentative and question_id = p_question) then raise exception 'deja_repondu'; end if;
  return ecrire_reponse(p_tentative, p_question, p_choix, p_texte, least(v_ecoule, v_duree * 1000));
end $$;

create or replace function etat_pilote(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s session_evaluation;
  v_personnel boolean;
  v_index int;
  v_reveles int;
begin
  select * into s from session_evaluation where id = p_session;
  if s.id is null then raise exception 'session_fermee'; end if;
  v_personnel := peut_piloter(s.groupe_id);
  if not v_personnel and not eleve_inscrit(s.groupe_id) then raise exception 'non_inscrit'; end if;
  select x.idx into v_index from (
    select fq.question_id, (row_number() over (order by fq.ordre) - 1)::int as idx from fiche_question fq where fq.fiche_id = s.fiche_id) x
  where x.question_id = s.question_courante_id;
  v_index := coalesce(v_index, -1);
  -- l'élève voit les bonnes réponses des questions déjà révélées seulement
  v_reveles := case when v_personnel then 100000 when s.etape = 'question' then v_index - 1 else v_index end;
  return jsonb_strip_nulls(jsonb_build_object(
    'maintenant', now(),
    'detail', j_detail_session(p_session),
    'questions', j_questions(s.fiche_id, v_reveles),
    'index', v_index,
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object('eleve', jsonb_build_object('id', e.id, 'prenom', e.prenom, 'nom', left(e.nom, 1)), 'arrive_le', p.arrive_le) order by p.arrive_le)
      from participant_session p join eleve e on e.id = p.eleve_id where p.session_id = p_session), '[]'),
    'reponsesQuestion', coalesce((
      select jsonb_agg(to_jsonb(r))
      from reponse r join tentative t on t.id = r.tentative_id
      where t.session_id = p_session and r.question_id = s.question_courante_id
        and (v_personnel or t.eleve_id = eleve_courant())), '[]')));
end $$;

create or replace function classement_en_direct(p_session uuid, p_limite int default 10) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s session_evaluation;
  v_cur int;
  v_borne int;
begin
  select * into s from session_evaluation where id = p_session;
  if s.id is null or not (peut_piloter(s.groupe_id) or eleve_inscrit(s.groupe_id)) then return '[]'; end if;
  select x.idx into v_cur from (
    select fq.question_id, (row_number() over (order by fq.ordre) - 1)::int as idx from fiche_question fq where fq.fiche_id = s.fiche_id) x
  where x.question_id = s.question_courante_id;
  v_cur := coalesce(v_cur, -1);
  -- pendant une question en cours, elle ne compte pas encore
  v_borne := case when s.etape = 'question' then v_cur - 1 else v_cur end;
  return coalesce((
    with qs as (
           select q.id, q.duree_secondes, (row_number() over (order by fq.ordre) - 1)::int as idx
           from fiche_question fq join question q on q.id = fq.question_id where fq.fiche_id = s.fiche_id),
         lancees as (select * from qs where idx <= v_borne),
         z as (
           select t.eleve_id, e.prenom || ' ' || upper(left(e.nom, 1)) || '.' as nom_affiche,
             coalesce((select sum(r.score_final) from reponse r join lancees l on l.id = r.question_id where r.tentative_id = t.id), 0) as score,
             -- une question lancée sans réponse compte pour toute sa durée
             coalesce((select sum(coalesce(r.temps_ms, l.duree_secondes * 1000)) from lancees l
                       left join reponse r on r.tentative_id = t.id and r.question_id = l.id), 0) as temps
           from tentative t join eleve e on e.id = t.eleve_id where t.session_id = p_session),
         y as (select z.*, rank() over (order by z.score desc, z.temps asc)::int as rang from z order by rang limit p_limite)
    select jsonb_agg(jsonb_build_object('rang', y.rang, 'eleve_id', y.eleve_id, 'nom_affiche', y.nom_affiche,
                     'score', y.score, 'temps_total_ms', y.temps) order by y.rang, y.nom_affiche)
    from y), '[]');
end $$;
