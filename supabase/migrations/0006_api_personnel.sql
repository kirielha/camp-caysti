-- =====================================================================
-- 0006 — API du personnel (formateurs, admins de camp, super-admins)
-- Mêmes règles que src/lib/droits.ts et src/data/localStaffRepository.ts
-- =====================================================================

-- ---------------------------------------------------------------------
-- Comptes
-- ---------------------------------------------------------------------
create or replace function j_personnel(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(u) || jsonb_build_object('roles', coalesce((select jsonb_agg(to_jsonb(r)) from attribution_role r where r.utilisateur_id = u.id), '[]'))
  from utilisateur u where u.id = p_id
$$;

-- Profil du compte connecté ; null si le compte n'a pas encore de fiche personnel
create or replace function mon_profil() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when est_anonyme() then null else jsonb_strip_nulls(j_personnel(auth.uid())) end
  from utilisateur u where u.id = auth.uid()
$$;

-- Premier passage d'un membre du personnel : il crée sa fiche (sans aucun rôle).
-- Un super-admin lui attribue ensuite ses rôles.
create or replace function creer_mon_profil(p_prenom text, p_nom text, p_telephone text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if auth.uid() is null or est_anonyme() then raise exception 'droits:Connectez-vous avec votre adresse e-mail'; end if;
  if coalesce(trim(p_prenom), '') = '' or coalesce(trim(p_nom), '') = '' then raise exception 'droits:Indiquez votre prénom et votre nom'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into utilisateur (id, prenom, nom, email, telephone)
  values (auth.uid(), trim(p_prenom), trim(p_nom), v_email, nullif(trim(coalesce(p_telephone, '')), ''))
  on conflict (id) do update set prenom = excluded.prenom, nom = excluded.nom, telephone = excluded.telephone;
  return jsonb_strip_nulls(j_personnel(auth.uid()));
end $$;

create or replace function liste_personnel() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_admin() then raise exception 'droits:Réservé aux admins'; end if;
  return jsonb_strip_nulls(coalesce((select jsonb_agg(j_personnel(u.id) order by u.nom, u.prenom) from utilisateur u), '[]'));
end $$;

-- Un super-admin attribue tout rôle ; un admin de camp peut nommer formateurs et lecteurs de son camp
create or replace function attribuer_role(p_utilisateur uuid, p_role role_utilisateur, p_camp uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exiger_personnel();
  if not (est_super_admin() or (p_role in ('formateur', 'lecteur') and p_camp is not null and est_admin_camp(p_camp))) then
    raise exception 'droits:Vous ne pouvez pas attribuer ce rôle';
  end if;
  if p_role = 'super_admin' and p_camp is not null then raise exception 'droits:Un super-admin couvre tous les camps'; end if;
  insert into attribution_role (utilisateur_id, role, camp_id)
  select p_utilisateur, p_role, p_camp
  where not exists (select 1 from attribution_role where utilisateur_id = p_utilisateur and role = p_role and camp_id is not distinct from p_camp);
end $$;

create or replace function retirer_role(p_role_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r attribution_role;
begin
  select * into r from attribution_role where id = p_role_id;
  if r.id is null then return; end if;
  if not (est_super_admin() or (r.role in ('formateur', 'lecteur') and r.camp_id is not null and est_admin_camp(r.camp_id))) then
    raise exception 'droits:Vous ne pouvez pas retirer ce rôle';
  end if;
  if r.utilisateur_id = moi() and r.role = 'super_admin' then raise exception 'droits:Vous ne pouvez pas retirer votre propre rôle de super-admin'; end if;
  delete from attribution_role where id = p_role_id;
end $$;

-- À lancer UNE fois dans l'éditeur SQL de Supabase (jamais appelable depuis l'application) :
--   select promouvoir_super_admin('votre.adresse@exemple.org');
create or replace function promouvoir_super_admin(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from utilisateur where lower(email) = lower(p_email);
  if v_id is null then return 'Aucun compte avec cette adresse : connectez-vous d’abord une fois à l’application.'; end if;
  insert into attribution_role (utilisateur_id, role) select v_id, 'super_admin'
    where not exists (select 1 from attribution_role where utilisateur_id = v_id and role = 'super_admin');
  return 'Super-admin attribué à ' || p_email;
end $$;

-- ---------------------------------------------------------------------
-- Pilotage des groupes
-- ---------------------------------------------------------------------
create or replace function j_groupe_formateur(g groupe, p_role role_formateur) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'groupe', j_groupe(g), 'atelier', to_jsonb(a), 'technologie', to_jsonb(t), 'camp', to_jsonb(c),
    'role', p_role, 'nb_eleves', (select count(*) from inscription i where i.groupe_id = g.id))
  from atelier a join technologie t on t.id = a.technologie_id join camp c on c.id = a.camp_id
  where a.id = g.atelier_id
$$;

create or replace function groupes_personnel() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_moi uuid := exiger_personnel();
begin
  return jsonb_strip_nulls(coalesce((
    select jsonb_agg(j_groupe_formateur(g, (select gf.role from groupe_formateur gf where gf.groupe_id = g.id and gf.utilisateur_id = v_moi))
                     order by g.date, g.heure_debut)
    from groupe g join atelier a on a.id = g.atelier_id
    where case when est_admin() then est_admin_camp(a.camp_id)
               else exists (select 1 from groupe_formateur gf where gf.groupe_id = g.id and gf.utilisateur_id = v_moi) end), '[]'));
end $$;

create or replace function detail_groupe(p_groupe uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g groupe;
begin
  if not peut_piloter(p_groupe) then raise exception 'droits:Ce groupe n’est pas le vôtre'; end if;
  select * into g from groupe where id = p_groupe;
  return jsonb_strip_nulls(j_groupe_formateur(g, (select gf.role from groupe_formateur gf where gf.groupe_id = g.id and gf.utilisateur_id = moi())) || jsonb_build_object(
    'formateurs', coalesce((
      select jsonb_agg(jsonb_build_object('utilisateur', to_jsonb(u), 'role', gf.role) order by gf.role, u.nom)
      from groupe_formateur gf join utilisateur u on u.id = gf.utilisateur_id where gf.groupe_id = p_groupe), '[]'),
    'eleves', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.nom, e.prenom)
      from inscription i join eleve e on e.id = i.eleve_id where i.groupe_id = p_groupe), '[]'),
    'activites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'session', to_jsonb(s), 'fiche', to_jsonb(f),
        'nb_questions', (select count(*) from fiche_question fq where fq.fiche_id = f.id),
        'nb_soumises', (select count(*) from tentative t where t.session_id = s.id and t.statut <> 'en_cours'),
        'nb_en_cours', (select count(*) from tentative t where t.session_id = s.id and t.statut = 'en_cours'))
        order by ordre_deroule(f.type), s.cree_le)
      from session_evaluation s join fiche f on f.id = s.fiche_id where s.groupe_id = p_groupe), '[]')));
end $$;

create or replace function resultats_session(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s session_evaluation;
begin
  select * into s from session_evaluation where id = p_session;
  if s.id is null or not peut_piloter(s.groupe_id) then raise exception 'droits:Ce groupe n’est pas le vôtre'; end if;
  return jsonb_strip_nulls(coalesce((
    select jsonb_agg(jsonb_build_object(
      'eleve', to_jsonb(e), 'tentative', to_jsonb(t),
      'en_attente', (select count(*) from reponse r where r.tentative_id = t.id and r.statut_correction = 'en_attente'))
      order by case when t.id is null then 2 when t.statut = 'en_cours' then 1 else 0 end,
               coalesce(t.score, 0) desc, coalesce(t.temps_total_ms, 0), e.nom, e.prenom)
    from inscription i join eleve e on e.id = i.eleve_id
    left join tentative t on t.session_id = p_session and t.eleve_id = e.id
    where i.groupe_id = s.groupe_id), '[]'));
end $$;

create or replace function changer_statut_groupe(p_groupe uuid, p_statut statut_groupe) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not peut_piloter(p_groupe) then raise exception 'droits:Ce groupe n’est pas le vôtre'; end if;
  update groupe set statut = p_statut where id = p_groupe;
end $$;

-- Clôt les tentatives commencées et non terminées (fermeture d'une activité)
create or replace function clore_tentatives(p_session uuid, p_statut statut_tentative, p_pilote boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t tentative; x record;
begin
  for t in select * from tentative where session_id = p_session and statut = 'en_cours' for update loop
    select * into x from totaux_tentative(t.id, p_pilote);
    update tentative set statut = p_statut, fin = now(), score = x.score, score_max = x.score_max, temps_total_ms = x.temps where id = t.id;
  end loop;
end $$;

create or replace function changer_statut_session(p_session uuid, p_statut statut_session) returns void
language plpgsql security definer set search_path = public as $$
declare s session_evaluation;
begin
  select * into s from session_evaluation where id = p_session;
  if s.id is null or not peut_piloter(s.groupe_id) then raise exception 'droits:Ce groupe n’est pas le vôtre'; end if;
  update session_evaluation set
    statut = p_statut,
    ouverte_le = case when p_statut = 'ouverte' then now() else ouverte_le end,
    lancee_par = case when p_statut = 'ouverte' then moi() else lancee_par end,
    fermee_le  = case when p_statut = 'fermee' then now() else fermee_le end
  where id = p_session;
  if p_statut = 'fermee' then perform clore_tentatives(p_session, 'expiree', s.mode = 'pilote'); end if;
end $$;

create or replace function changer_affichage_classement(p_session uuid, p_affiche boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_groupe uuid;
begin
  select groupe_id into v_groupe from session_evaluation where id = p_session;
  if not peut_piloter(v_groupe) then raise exception 'droits:Ce groupe n’est pas le vôtre'; end if;
  update session_evaluation set classement_affiche = p_affiche where id = p_session;
end $$;

create or replace function changer_mode_session(p_session uuid, p_mode mode_session) returns void
language plpgsql security definer set search_path = public as $$
declare v_groupe uuid;
begin
  select groupe_id into v_groupe from session_evaluation where id = p_session;
  if not peut_piloter(v_groupe) then raise exception 'droits:Ce groupe n’est pas le vôtre'; end if;
  if exists (select 1 from tentative where session_id = p_session) then
    raise exception 'droits:Des élèves ont déjà commencé : le mode ne peut plus changer';
  end if;
  update session_evaluation set mode = p_mode, etape = 'attente', question_courante_id = null, question_lancee_le = null where id = p_session;
end $$;

-- Commandes du mode piloté : suivante, reveler, classement, terminer
create or replace function piloter(p_session uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s session_evaluation;
  v_index int;
  v_suivante uuid;
begin
  select * into s from session_evaluation where id = p_session for update;
  if s.id is null or not peut_piloter(s.groupe_id) then raise exception 'droits:Ce groupe n’est pas le vôtre'; end if;
  if s.mode <> 'pilote' then raise exception 'droits:Cette activité n’est pas en mode piloté'; end if;
  if s.statut <> 'ouverte' and p_action <> 'terminer' then raise exception 'droits:Ouvrez d’abord l’activité'; end if;
  if p_action = 'suivante' and (select statut from groupe where id = s.groupe_id) <> 'en_cours' then
    raise exception 'droits:Démarrez d’abord l’atelier';
  end if;

  select x.idx into v_index from (
    select fq.question_id, (row_number() over (order by fq.ordre) - 1)::int as idx from fiche_question fq where fq.fiche_id = s.fiche_id) x
  where x.question_id = s.question_courante_id;
  v_index := coalesce(v_index, -1);

  if p_action = 'suivante' then
    select fq.question_id into v_suivante from fiche_question fq where fq.fiche_id = s.fiche_id order by fq.ordre offset v_index + 1 limit 1;
    if v_suivante is not null then
      update session_evaluation set etape = 'question', question_courante_id = v_suivante, question_lancee_le = now(),
        lancee_par = case when v_index = -1 then moi() else lancee_par end
      where id = p_session;
      return;
    end if;
  elsif p_action in ('reveler', 'classement') then
    if v_index = -1 then raise exception 'droits:Lancez d’abord une question'; end if;
    update session_evaluation set etape = case when p_action = 'reveler' then 'revelation'::etape_session else 'classement'::etape_session end where id = p_session;
    return;
  elsif p_action <> 'terminer' then
    raise exception 'droits:Commande inconnue';
  end if;

  -- terminer (ou « suivante » après la dernière question)
  perform clore_tentatives(p_session, 'soumise', true);
  update session_evaluation set etape = 'terminee', statut = 'fermee', fermee_le = now() where id = p_session;
end $$;

create or replace function peut_programmer(f fiche) returns boolean
language sql stable security definer set search_path = public as $$
  select f.statut_validation = 'validee' or f.auteur_id = moi()
$$;

create or replace function ajouter_activite(p_groupe uuid, p_fiche uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f fiche;
begin
  if not peut_piloter(p_groupe) then raise exception 'droits:Ce groupe n’est pas le vôtre'; end if;
  select * into f from fiche where id = p_fiche;
  if f.id is null then raise exception 'droits:Fiche introuvable'; end if;
  if not peut_programmer(f) then raise exception 'droits:Cette fiche doit d’abord être validée par un admin'; end if;
  insert into session_evaluation (fiche_id, groupe_id, mode, mode_correction, statut, classement_affiche, etape)
  values (p_fiche, p_groupe, 'libre', f.mode_correction, 'brouillon', f.type <> 'satisfaction', 'attente');
end $$;

create or replace function retirer_activite(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_groupe uuid;
begin
  select groupe_id into v_groupe from session_evaluation where id = p_session;
  if not peut_piloter(v_groupe) then raise exception 'droits:Ce groupe n’est pas le vôtre'; end if;
  if exists (select 1 from tentative where session_id = p_session) then
    raise exception 'droits:Des élèves ont déjà commencé cette activité : fermez-la plutôt que de la retirer';
  end if;
  delete from participant_session where session_id = p_session;
  delete from session_evaluation where id = p_session;
end $$;

-- ---------------------------------------------------------------------
-- Banque de fiches
-- ---------------------------------------------------------------------
create or replace function fiche_visible(f fiche) returns boolean
language sql stable security definer set search_path = public as $$
  select f.visibilite <> 'privee' or f.auteur_id = moi() or (est_admin() and f.statut_validation = 'soumise')
$$;

create or replace function peut_modifier_fiche(f fiche) returns boolean
language sql stable security definer set search_path = public as $$
  select est_admin() or (f.auteur_id = moi() and f.statut_validation <> 'validee')
$$;

create or replace function fiches_visibles() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform exiger_personnel();
  return jsonb_strip_nulls(coalesce((
    select jsonb_agg(jsonb_build_object(
      'fiche', to_jsonb(f),
      'auteur', coalesce((select u.prenom || ' ' || u.nom from utilisateur u where u.id = f.auteur_id), '—'),
      'technologie', (select to_jsonb(t) from technologie t where t.id = f.technologie_id),
      'nb_questions', (select count(*) from fiche_question fq where fq.fiche_id = f.id),
      'nb_sessions', (select count(*) from session_evaluation s where s.fiche_id = f.id)))
    from fiche f where fiche_visible(f)), '[]'));
end $$;

create or replace function charger_fiche(p_fiche uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f fiche;
begin
  perform exiger_personnel();
  select * into f from fiche where id = p_fiche;
  if f.id is null or not fiche_visible(f) then raise exception 'droits:Fiche introuvable'; end if;
  return jsonb_strip_nulls(jsonb_build_object('fiche', to_jsonb(f), 'questions', j_questions(p_fiche, 100000)));
end $$;

-- Supprime une question qui n'est plus dans aucune fiche et à laquelle aucun élève n'a répondu
create or replace function supprimer_question_orpheline(p_question uuid) returns void
language sql security definer set search_path = public as $$
  delete from question q where q.id = p_question
    and not exists (select 1 from fiche_question fq where fq.question_id = q.id)
    and not exists (select 1 from reponse r where r.question_id = q.id)
$$;

-- Crée ou met à jour une fiche et toutes ses questions. p = { fiche: {...}, questions: [{..., choix: [...]}] }
create or replace function enregistrer_fiche(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_moi uuid := exiger_personnel();
  v fiche := jsonb_populate_record(null::fiche, p -> 'fiche');
  existante fiche;
  v_vis visibilite_fiche;
  v_anciennes uuid[];
  q jsonb;
  qr question;
  c jsonb;
  i int := 0;
  j int;
begin
  select * into existante from fiche where id = v.id for update;
  if existante.id is not null and not peut_modifier_fiche(existante) then raise exception 'droits:Vous ne pouvez pas modifier cette fiche'; end if;
  if existante.id is not null and not est_admin() and exists (
    select 1 from tentative t join session_evaluation s on s.id = t.session_id where s.fiche_id = v.id) then
    raise exception 'droits:Des élèves ont déjà passé cette fiche : dupliquez-la pour la modifier';
  end if;
  if coalesce(trim(v.titre_fr), '') = '' then raise exception 'droits:Donnez un titre en français à la fiche'; end if;
  -- l'auteur choisit privé ou partagé ; « officielle » ne s'obtient que par la validation d'un admin
  v_vis := case when v.visibilite in ('privee', 'partagee') and coalesce(existante.statut_validation, 'brouillon') <> 'validee'
                then v.visibilite else coalesce(existante.visibilite, 'privee') end;

  if existante.id is null then
    insert into fiche (id, titre_fr, titre_en, type, technologie_id, mode_correction, visibilite, statut_validation, fiche_jumelle_id, auteur_id)
    values (v.id, trim(v.titre_fr), nullif(trim(coalesce(v.titre_en, '')), ''), v.type, v.technologie_id, coalesce(v.mode_correction, 'ia_definitive'),
            v_vis, 'brouillon', v.fiche_jumelle_id, v_moi);
  else
    update fiche set titre_fr = trim(v.titre_fr), titre_en = nullif(trim(coalesce(v.titre_en, '')), ''), type = v.type,
      technologie_id = v.technologie_id, mode_correction = coalesce(v.mode_correction, mode_correction), visibilite = v_vis,
      fiche_jumelle_id = v.fiche_jumelle_id,
      statut_validation = case when statut_validation = 'refusee' then 'brouillon' else statut_validation end
    where id = v.id;
  end if;

  select coalesce(array_agg(question_id), '{}') into v_anciennes from fiche_question where fiche_id = v.id;
  delete from fiche_question where fiche_id = v.id;

  for q in select * from jsonb_array_elements(coalesce(p -> 'questions', '[]')) loop
    qr := jsonb_populate_record(null::question, q);
    insert into question (id, type, enonce_fr, enonce_en, image, duree_secondes, points, mode_bareme, reponse_attendue_fr,
                          reponse_attendue_en, criteres_correction, competence_id, question_jumelle_id, auteur_id)
    values (qr.id, qr.type, qr.enonce_fr, qr.enonce_en, qr.image, qr.duree_secondes, coalesce(qr.points, 0), coalesce(qr.mode_bareme, 'tout_ou_rien'),
            qr.reponse_attendue_fr, qr.reponse_attendue_en, qr.criteres_correction, qr.competence_id, qr.question_jumelle_id, v_moi)
    on conflict (id) do update set type = excluded.type, enonce_fr = excluded.enonce_fr, enonce_en = excluded.enonce_en, image = excluded.image,
      duree_secondes = excluded.duree_secondes, points = excluded.points, mode_bareme = excluded.mode_bareme,
      reponse_attendue_fr = excluded.reponse_attendue_fr, reponse_attendue_en = excluded.reponse_attendue_en,
      criteres_correction = excluded.criteres_correction, competence_id = excluded.competence_id,
      question_jumelle_id = excluded.question_jumelle_id;
    delete from choix where question_id = qr.id;
    j := 0;
    for c in select * from jsonb_array_elements(coalesce(q -> 'choix', '[]')) loop
      insert into choix (id, question_id, texte_fr, texte_en, image, est_correct, ordre)
      values (coalesce((c ->> 'id')::uuid, gen_random_uuid()), qr.id, coalesce(c ->> 'texte_fr', ''), nullif(c ->> 'texte_en', ''),
              nullif(c ->> 'image', ''), coalesce((c ->> 'est_correct')::boolean, false), j);
      j := j + 1;
    end loop;
    insert into fiche_question (fiche_id, question_id, ordre) values (v.id, qr.id, i);
    i := i + 1;
  end loop;

  perform supprimer_question_orpheline(x) from unnest(v_anciennes) x;
  return v.id;
end $$;

create or replace function dupliquer_fiche(p_fiche uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  f fiche;
  v_contenu jsonb := charger_fiche(p_fiche);
  v_id uuid := gen_random_uuid();
  v_questions jsonb := '[]';
  q jsonb;
  v_qid uuid;
begin
  select * into f from fiche where id = p_fiche;
  for q in select * from jsonb_array_elements(v_contenu -> 'questions') loop
    v_qid := gen_random_uuid();
    v_questions := v_questions || jsonb_build_array(q || jsonb_build_object('id', v_qid, 'choix', coalesce((
      select jsonb_agg(c || jsonb_build_object('id', gen_random_uuid())) from jsonb_array_elements(q -> 'choix') c), '[]')));
  end loop;
  perform enregistrer_fiche(jsonb_build_object(
    'fiche', to_jsonb(f) || jsonb_build_object('id', v_id, 'titre_fr', f.titre_fr || ' (copie)',
                                               'titre_en', case when f.titre_en is null then null else f.titre_en || ' (copy)' end,
                                               'visibilite', 'privee'),
    'questions', v_questions));
  return v_id;
end $$;

create or replace function soumettre_fiche(p_fiche uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f fiche;
begin
  select * into f from fiche where id = p_fiche;
  if f.id is null or not peut_modifier_fiche(f) then raise exception 'droits:Vous ne pouvez pas modifier cette fiche'; end if;
  if not exists (select 1 from fiche_question where fiche_id = p_fiche) then raise exception 'droits:Ajoutez au moins une question avant de soumettre'; end if;
  update fiche set statut_validation = 'soumise', commentaire_validation = null where id = p_fiche;
end $$;

create or replace function valider_fiche(p_fiche uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_admin() then raise exception 'droits:Seul un admin peut valider une fiche'; end if;
  update fiche set statut_validation = 'validee', visibilite = 'officielle', validee_par = moi(), validee_le = now(), commentaire_validation = null
  where id = p_fiche;
end $$;

create or replace function refuser_fiche(p_fiche uuid, p_commentaire text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_admin() then raise exception 'droits:Seul un admin peut refuser une fiche'; end if;
  if coalesce(trim(p_commentaire), '') = '' then raise exception 'droits:Expliquez à l’auteur ce qu’il faut corriger'; end if;
  update fiche set statut_validation = 'refusee', commentaire_validation = trim(p_commentaire) where id = p_fiche;
end $$;

create or replace function supprimer_fiche(p_fiche uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f fiche; v_questions uuid[];
begin
  select * into f from fiche where id = p_fiche;
  if f.id is null or not peut_modifier_fiche(f) then raise exception 'droits:Vous ne pouvez pas modifier cette fiche'; end if;
  if exists (select 1 from session_evaluation where fiche_id = p_fiche) then
    raise exception 'droits:Cette fiche est programmée dans un groupe : retirez-la d’abord';
  end if;
  select coalesce(array_agg(question_id), '{}') into v_questions from fiche_question where fiche_id = p_fiche;
  delete from fiche_question where fiche_id = p_fiche;
  update fiche set fiche_jumelle_id = null where fiche_jumelle_id = p_fiche;
  delete from fiche where id = p_fiche;
  perform supprimer_question_orpheline(x) from unnest(v_questions) x;
end $$;

-- ---------------------------------------------------------------------
-- Gestion du camp
-- ---------------------------------------------------------------------
create or replace function camps() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_moi uuid := exiger_personnel();
begin
  return jsonb_strip_nulls(coalesce((
    select jsonb_agg(to_jsonb(c) || jsonb_build_object('ville', v.nom, 'pays', p.nom, 'pays_code', p.code_iso) order by c.date_debut desc)
    from camp c join ville v on v.id = c.ville_id join pays p on p.id = v.pays_id
    where est_super_admin() or exists (
      select 1 from attribution_role r where r.utilisateur_id = v_moi and (r.camp_id is null or r.camp_id = c.id))), '[]'));
end $$;

-- p = { id?, nom, pays_code, pays_nom, ville, date_debut, date_fin, lieu?, statut? }
create or replace function enregistrer_camp(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  v_pays uuid;
  v_ville uuid;
begin
  if not (est_super_admin() or (exists (select 1 from camp where id = v_id) and est_admin_camp(v_id))) then
    raise exception 'droits:Seul un super-admin crée un camp';
  end if;
  if coalesce(trim(p ->> 'nom'), '') = '' or coalesce(trim(p ->> 'ville'), '') = '' or (p ->> 'pays_code') is null then
    raise exception 'droits:Indiquez le nom du camp, le pays et la ville';
  end if;
  if (p ->> 'date_fin')::date < (p ->> 'date_debut')::date then raise exception 'droits:La date de fin doit suivre la date de début'; end if;
  insert into pays (nom, code_iso) values (coalesce(p ->> 'pays_nom', p ->> 'pays_code'), upper(p ->> 'pays_code'))
    on conflict (code_iso) do update set nom = pays.nom returning id into v_pays;
  insert into ville (pays_id, nom) values (v_pays, trim(p ->> 'ville'))
    on conflict (pays_id, nom) do update set nom = ville.nom returning id into v_ville;
  insert into camp (id, ville_id, nom, date_debut, date_fin, lieu, statut)
  values (v_id, v_ville, trim(p ->> 'nom'), (p ->> 'date_debut')::date, (p ->> 'date_fin')::date, nullif(trim(coalesce(p ->> 'lieu', '')), ''),
          coalesce((p ->> 'statut')::statut_camp, 'preparation'))
  on conflict (id) do update set ville_id = excluded.ville_id, nom = excluded.nom, date_debut = excluded.date_debut,
    date_fin = excluded.date_fin, lieu = excluded.lieu, statut = excluded.statut;
  return v_id;
end $$;

create or replace function structure_camp(p_camp uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_admin_camp(p_camp) then raise exception 'droits:Réservé aux admins de ce camp'; end if;
  return jsonb_strip_nulls(coalesce((
    select jsonb_agg(x.j order by x.cle nulls last) from (
      select (select min(g.date::text || ' ' || to_char(g.heure_debut, 'HH24:MI')) from groupe g where g.atelier_id = a.id) as cle,
        jsonb_build_object('atelier', to_jsonb(a), 'technologie', to_jsonb(t), 'groupes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'groupe', j_groupe(g),
            'formateurs', coalesce((select jsonb_agg(jsonb_build_object('utilisateur', to_jsonb(u), 'role', gf.role) order by gf.role, u.nom)
                                    from groupe_formateur gf join utilisateur u on u.id = gf.utilisateur_id where gf.groupe_id = g.id), '[]'),
            'nb_eleves', (select count(*) from inscription i where i.groupe_id = g.id)) order by g.date, g.heure_debut)
          from groupe g where g.atelier_id = a.id), '[]')) as j
      from atelier a join technologie t on t.id = a.technologie_id where a.camp_id = p_camp) x), '[]'));
end $$;

create or replace function enregistrer_atelier(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a atelier := jsonb_populate_record(null::atelier, p);
begin
  if not est_admin_camp(a.camp_id) then raise exception 'droits:Seul un admin du camp gère les ateliers'; end if;
  if coalesce(trim(a.titre_fr), '') = '' then raise exception 'droits:Donnez un titre à l’atelier'; end if;
  insert into atelier (id, camp_id, technologie_id, titre_fr, titre_en, description_fr, description_en, image)
  values (coalesce(a.id, gen_random_uuid()), a.camp_id, a.technologie_id, trim(a.titre_fr), a.titre_en, a.description_fr, a.description_en, a.image)
  on conflict (id) do update set technologie_id = excluded.technologie_id, titre_fr = excluded.titre_fr, titre_en = excluded.titre_en,
    description_fr = excluded.description_fr, description_en = excluded.description_en, image = excluded.image;
end $$;

-- p_formateurs = [{ utilisateur_id, role: principal|secondaire }]
create or replace function enregistrer_groupe(p_groupe jsonb, p_formateurs jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  g groupe := jsonb_populate_record(null::groupe, p_groupe);
  f jsonb;
begin
  if not est_admin_camp((select camp_id from atelier where id = g.atelier_id)) then raise exception 'droits:Seul un admin du camp gère les groupes'; end if;
  if coalesce(trim(g.nom), '') = '' then raise exception 'droits:Donnez un nom au groupe'; end if;
  if g.heure_fin <= g.heure_debut then raise exception 'droits:L’heure de fin doit être après l’heure de début'; end if;
  if (select count(*) from jsonb_array_elements(coalesce(p_formateurs, '[]')) x where x ->> 'role' = 'principal') > 1 then
    raise exception 'droits:Un groupe n’a qu’un formateur principal';
  end if;
  insert into groupe (id, atelier_id, nom, date, heure_debut, heure_fin, salle, statut)
  values (g.id, g.atelier_id, trim(g.nom), g.date, g.heure_debut, g.heure_fin, nullif(trim(coalesce(g.salle, '')), ''), coalesce(g.statut, 'a_venir'))
  on conflict (id) do update set nom = excluded.nom, date = excluded.date, heure_debut = excluded.heure_debut,
    heure_fin = excluded.heure_fin, salle = excluded.salle;
  delete from groupe_formateur where groupe_id = g.id;
  for f in select distinct on (x ->> 'utilisateur_id') x from jsonb_array_elements(coalesce(p_formateurs, '[]')) x loop
    insert into groupe_formateur (groupe_id, utilisateur_id, role) values (g.id, (f ->> 'utilisateur_id')::uuid, (f ->> 'role')::role_formateur);
  end loop;
end $$;

create or replace function supprimer_groupe(p_groupe uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_admin_camp(camp_du_groupe(p_groupe)) then raise exception 'droits:Seul un admin du camp supprime un groupe'; end if;
  if exists (select 1 from tentative t join session_evaluation s on s.id = t.session_id where s.groupe_id = p_groupe) then
    raise exception 'droits:Des élèves ont déjà passé des activités dans ce groupe : il ne peut plus être supprimé';
  end if;
  delete from participant_session where session_id in (select id from session_evaluation where groupe_id = p_groupe);
  delete from groupe where id = p_groupe; -- formateurs, inscriptions et sessions suivent (on delete cascade)
end $$;

create or replace function formateurs() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform exiger_personnel();
  return jsonb_strip_nulls(coalesce((
    select jsonb_agg(to_jsonb(u) order by u.nom, u.prenom) from utilisateur u
    where u.actif and exists (select 1 from attribution_role r where r.utilisateur_id = u.id and r.role in ('formateur', 'admin_camp', 'super_admin'))), '[]'));
end $$;

create or replace function eleves_camp(p_camp uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_admin_camp(p_camp) then raise exception 'droits:Réservé aux admins de ce camp'; end if;
  return jsonb_strip_nulls(coalesce((
    select jsonb_agg(jsonb_build_object(
      'eleve', to_jsonb(e),
      'ecole', (select to_jsonb(ec) from ecole ec where ec.id = e.ecole_id),
      'tuteur', (select to_jsonb(tu) from eleve_tuteur et join tuteur tu on tu.id = et.tuteur_id
                 where et.eleve_id = e.id order by et.tuteur_principal desc limit 1),
      'groupes', (select jsonb_agg(jsonb_build_object('groupe', j_groupe(g), 'atelier', to_jsonb(a)) order by g.date, g.heure_debut)
                  from inscription i join groupe g on g.id = i.groupe_id join atelier a on a.id = g.atelier_id
                  where i.eleve_id = e.id and a.camp_id = p_camp))
      order by e.nom, e.prenom)
    from eleve e
    where exists (select 1 from inscription i join groupe g on g.id = i.groupe_id join atelier a on a.id = g.atelier_id
                  where i.eleve_id = e.id and a.camp_id = p_camp)), '[]'));
end $$;

-- Remplace les inscriptions d'un élève aux groupes de ce camp (les autres camps ne sont pas touchés)
create or replace function remplacer_inscriptions(p_eleve uuid, p_camp uuid, p_groupes uuid[]) returns void
language sql security definer set search_path = public as $$
  delete from inscription i using groupe g, atelier a
    where i.eleve_id = p_eleve and g.id = i.groupe_id and a.id = g.atelier_id and a.camp_id = p_camp
      and not (i.groupe_id = any(coalesce(p_groupes, '{}')));
  insert into inscription (eleve_id, groupe_id)
    select p_eleve, g.id from groupe g join atelier a on a.id = g.atelier_id
    where a.camp_id = p_camp and g.id = any(coalesce(p_groupes, '{}'))
  on conflict (eleve_id, groupe_id) do nothing;
$$;

create or replace function lier_tuteur(p_eleve uuid, p_tuteur jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce((p_tuteur ->> 'id')::uuid, gen_random_uuid());
begin
  insert into tuteur (id, nom, prenom, telephone, whatsapp, email, lien, consentement_le, consentement_mode)
  values (v_id, coalesce(nullif(trim(coalesce(p_tuteur ->> 'nom', '')), ''), '—'), p_tuteur ->> 'prenom',
          nullif(trim(coalesce(p_tuteur ->> 'telephone', '')), ''), nullif(trim(coalesce(p_tuteur ->> 'whatsapp', '')), ''),
          nullif(trim(coalesce(p_tuteur ->> 'email', '')), ''), nullif(trim(coalesce(p_tuteur ->> 'lien', '')), ''),
          (p_tuteur ->> 'consentement_le')::timestamptz, p_tuteur ->> 'consentement_mode')
  on conflict (id) do update set nom = excluded.nom, prenom = excluded.prenom, telephone = excluded.telephone, whatsapp = excluded.whatsapp,
    email = excluded.email, lien = excluded.lien, consentement_le = excluded.consentement_le, consentement_mode = excluded.consentement_mode;
  if not exists (select 1 from eleve_tuteur where eleve_id = p_eleve and tuteur_id = v_id) then
    update eleve_tuteur set tuteur_principal = false where eleve_id = p_eleve;
    insert into eleve_tuteur (eleve_id, tuteur_id, tuteur_principal) values (p_eleve, v_id, true);
  end if;
end $$;

create or replace function enregistrer_eleve(p_camp uuid, p_eleve jsonb, p_tuteur jsonb, p_groupes uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e eleve := jsonb_populate_record(null::eleve, p_eleve);
begin
  if not est_admin_camp(p_camp) then raise exception 'droits:Seul un admin du camp inscrit des élèves'; end if;
  if coalesce(trim(e.nom), '') = '' or coalesce(trim(e.prenom), '') = '' then raise exception 'droits:Nom et prénom sont obligatoires'; end if;
  if e.date_naissance is null then raise exception 'droits:La date de naissance est obligatoire'; end if;
  if coalesce(p_tuteur ->> 'telephone', '') = '' and coalesce(p_tuteur ->> 'whatsapp', '') = '' and coalesce(p_tuteur ->> 'email', '') = '' then
    raise exception 'droits:Indiquez au moins un contact du parent';
  end if;
  insert into eleve (id, nom, prenom, date_naissance, sexe, classe, ecole_id, langue_id, langue_autre, langue_interface)
  values (coalesce(e.id, gen_random_uuid()), upper(trim(e.nom)), trim(e.prenom), e.date_naissance, e.sexe, e.classe, e.ecole_id,
          e.langue_id, nullif(trim(coalesce(e.langue_autre, '')), ''), coalesce(e.langue_interface, 'fr'))
  on conflict (id) do update set nom = excluded.nom, prenom = excluded.prenom, date_naissance = excluded.date_naissance,
    sexe = excluded.sexe, classe = excluded.classe, ecole_id = excluded.ecole_id, langue_id = excluded.langue_id,
    langue_autre = excluded.langue_autre, langue_interface = excluded.langue_interface
  returning * into e;
  perform lier_tuteur(e.id, p_tuteur);
  perform remplacer_inscriptions(e.id, p_camp, p_groupes);
  return jsonb_strip_nulls(to_jsonb(e));
end $$;

-- Import Excel : p_lignes = lignes analysées par src/lib/importEleves.ts ; seules celles sans erreur sont importées.
-- Le serveur revérifie les doublons (même nom, prénom, date de naissance) pour ne jamais créer deux fois un élève.
create or replace function importer_eleves(p_camp uuid, p_lignes jsonb, p_groupes uuid[], p_fichier text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l jsonb;
  e eleve;
  v_ecole uuid;
  v_crees jsonb := '[]';
  v_rattaches jsonb := '[]';
  v_ok int := 0;
  v_total int := 0;
begin
  if not est_admin_camp(p_camp) then raise exception 'droits:Seul un admin du camp importe des élèves'; end if;
  for l in select * from jsonb_array_elements(coalesce(p_lignes, '[]')) loop
    v_total := v_total + 1;
    continue when jsonb_array_length(coalesce(l -> 'erreurs', '[]')) > 0;
    v_ok := v_ok + 1;
    e := null;
    select * into e from eleve x
      where normaliser(x.nom) = normaliser(l ->> 'nom') and normaliser(x.prenom) = normaliser(l ->> 'prenom')
        and x.date_naissance = (l ->> 'date_naissance')::date
      limit 1;
    if e.id is not null then
      v_rattaches := v_rattaches || jsonb_build_array(jsonb_strip_nulls(to_jsonb(e)));
    else
      v_ecole := nullif(l ->> 'ecole_id', '')::uuid;
      if v_ecole is null and coalesce(trim(l ->> 'ecole_nom'), '') <> '' then
        select id into v_ecole from ecole where normaliser(nom) = normaliser(l ->> 'ecole_nom') limit 1;
        if v_ecole is null then insert into ecole (nom) values (trim(l ->> 'ecole_nom')) returning id into v_ecole; end if;
      end if;
      insert into eleve (nom, prenom, date_naissance, sexe, classe, ecole_id, langue_id, langue_autre)
      values (upper(trim(l ->> 'nom')), trim(l ->> 'prenom'), (l ->> 'date_naissance')::date, (l ->> 'sexe')::sexe, (l ->> 'classe')::classe,
              v_ecole, nullif(l ->> 'langue_id', '')::uuid, nullif(l ->> 'langue_autre', ''))
      returning * into e;
      perform lier_tuteur(e.id, coalesce(l -> 'tuteur', '{}'));
      v_crees := v_crees || jsonb_build_array(jsonb_strip_nulls(to_jsonb(e)));
    end if;
    insert into inscription (eleve_id, groupe_id)
      select e.id, g.id from groupe g join atelier a on a.id = g.atelier_id
      where a.camp_id = p_camp and g.id = any(coalesce(p_groupes, '{}'))
    on conflict (eleve_id, groupe_id) do nothing;
  end loop;
  insert into lot_import (utilisateur_id, camp_id, fichier, lignes_ok, lignes_erreur)
  values (moi(), p_camp, coalesce(p_fichier, 'import'), v_ok, v_total - v_ok);
  return jsonb_build_object('crees', v_crees, 'rattaches', v_rattaches);
end $$;

-- ---------------------------------------------------------------------
-- Référentiels
-- ---------------------------------------------------------------------
create or replace function ecoles() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when moi() is null then '[]'::jsonb else jsonb_strip_nulls(coalesce(jsonb_agg(to_jsonb(e) order by e.nom), '[]')) end from ecole e
$$;

create or replace function langues() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(coalesce(jsonb_agg(to_jsonb(l) order by l.ordre), '[]')) from langue l
$$;

create or replace function identites_eleves() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_admin() then raise exception 'droits:Réservé aux admins'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'prenom', prenom, 'date_naissance', date_naissance)) from eleve), '[]');
end $$;

create or replace function technologies() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(coalesce(jsonb_agg(to_jsonb(t) order by t.nom_fr), '[]')) from technologie t
$$;

create or replace function competences(p_technologie uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(coalesce(jsonb_agg(to_jsonb(c) order by c.libelle_fr), '[]'))
  from competence c where moi() is not null and (p_technologie is null or c.technologie_id = p_technologie)
$$;

create or replace function ajouter_competence(p_technologie uuid, p_libelle_fr text, p_libelle_en text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c competence;
begin
  perform exiger_personnel();
  if coalesce(trim(p_libelle_fr), '') = '' then raise exception 'droits:Donnez un libellé à la compétence'; end if;
  insert into competence (technologie_id, libelle_fr, libelle_en) values (p_technologie, trim(p_libelle_fr), nullif(trim(coalesce(p_libelle_en, '')), ''))
  returning * into c;
  return jsonb_strip_nulls(to_jsonb(c));
end $$;
