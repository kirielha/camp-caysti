-- =====================================================================
-- 0008 — Parties d'atelier, ressources (code source à copier), export
-- Un atelier se déroule en parties (ex. « IoT » puis « Programmation »).
-- Chaque partie a son prétest, son quiz et son post-test, et des ressources.
-- Le déroulé d'une partie est recopié automatiquement dans chaque groupe.
-- =====================================================================

create table partie (
  id                 uuid primary key default gen_random_uuid(),
  atelier_id         uuid not null references atelier(id) on delete cascade,
  ordre              int not null default 1,
  titre_fr           text not null,
  titre_en           text,
  fiche_pretest_id   uuid references fiche(id),
  fiche_quiz_id      uuid references fiche(id),
  fiche_posttest_id  uuid references fiche(id),
  cree_le            timestamptz not null default now()
);
create index on partie (atelier_id, ordre);

create table ressource (
  id         uuid primary key default gen_random_uuid(),
  partie_id  uuid not null references partie(id) on delete cascade,
  ordre      int not null default 1,
  titre      text not null,
  langage    text,          -- « arduino », « python »... (affichage seulement)
  contenu    text not null
);
create index on ressource (partie_id, ordre);

alter table session_evaluation add column partie_id uuid references partie(id) on delete set null;

alter table partie enable row level security;
alter table ressource enable row level security;
revoke all on partie, ressource from anon, authenticated;

-- ---------------------------------------------------------------------
-- JSON
-- ---------------------------------------------------------------------
-- Parties d'un atelier ; p_ressources = false pour les masquer (atelier pas encore démarré)
create or replace function j_parties(p_atelier uuid, p_ressources boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'partie', to_jsonb(p),
    'ressources', case when p_ressources then coalesce((
      select jsonb_agg(to_jsonb(r) order by r.ordre, r.titre) from ressource r where r.partie_id = p.id), '[]') else '[]' end)
    order by p.ordre, p.cree_le), '[]')
  from partie p where p.atelier_id = p_atelier
$$;

-- ---------------------------------------------------------------------
-- Déroulé : chaque fiche des parties devient une activité (fermée) du groupe
-- ---------------------------------------------------------------------
create or replace function appliquer_deroule(p_groupe uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into session_evaluation (fiche_id, groupe_id, partie_id, mode, mode_correction, statut, classement_affiche, etape)
  select f.id, g.id, p.id, 'libre', f.mode_correction, 'brouillon', f.type <> 'satisfaction', 'attente'
  from groupe g
  join partie p on p.atelier_id = g.atelier_id
  cross join lateral (values (p.fiche_pretest_id, 0), (p.fiche_quiz_id, 1), (p.fiche_posttest_id, 2)) x(fiche_id, rang)
  join fiche f on f.id = x.fiche_id
  where g.id = p_groupe
    and not exists (select 1 from session_evaluation s where s.groupe_id = g.id and s.partie_id = p.id and s.fiche_id = f.id)
  order by p.ordre, x.rang;
end $$;

create or replace function trg_deroule_groupe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform appliquer_deroule(new.id);
  return new;
end $$;
create trigger deroule after insert on groupe for each row execute function trg_deroule_groupe();

-- ---------------------------------------------------------------------
-- Gestion des parties (admin du camp)
-- p = { partie: {...}, ressources: [{ titre, langage, contenu }] }
-- ---------------------------------------------------------------------
create or replace function enregistrer_partie(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  x partie := jsonb_populate_record(null::partie, p -> 'partie');
  v_id uuid := coalesce(x.id, gen_random_uuid());
  r jsonb;
  i int := 0;
  f uuid;
begin
  if not est_admin_camp((select camp_id from atelier where id = x.atelier_id)) then
    raise exception 'droits:Seul un admin du camp gère les parties';
  end if;
  if exists (select 1 from partie where id = v_id and atelier_id <> x.atelier_id) then raise exception 'droits:Partie introuvable'; end if;
  if coalesce(trim(x.titre_fr), '') = '' then raise exception 'droits:Donnez un titre à la partie'; end if;
  foreach f in array array_remove(array[x.fiche_pretest_id, x.fiche_quiz_id, x.fiche_posttest_id], null) loop
    if not exists (select 1 from fiche where id = f and statut_validation = 'validee') then
      raise exception 'droits:Choisissez des fiches validées par un admin';
    end if;
  end loop;
  if x.fiche_pretest_id is not null and (select type from fiche where id = x.fiche_pretest_id) <> 'pretest'
     or x.fiche_quiz_id is not null and (select type from fiche where id = x.fiche_quiz_id) <> 'quiz'
     or x.fiche_posttest_id is not null and (select type from fiche where id = x.fiche_posttest_id) <> 'posttest' then
    raise exception 'droits:Chaque case attend une fiche du bon type (prétest, quiz, post-test)';
  end if;

  insert into partie (id, atelier_id, ordre, titre_fr, titre_en, fiche_pretest_id, fiche_quiz_id, fiche_posttest_id)
  values (v_id, x.atelier_id, coalesce(x.ordre, 1), trim(x.titre_fr), nullif(trim(coalesce(x.titre_en, '')), ''),
          x.fiche_pretest_id, x.fiche_quiz_id, x.fiche_posttest_id)
  on conflict (id) do update set ordre = excluded.ordre, titre_fr = excluded.titre_fr, titre_en = excluded.titre_en,
    fiche_pretest_id = excluded.fiche_pretest_id, fiche_quiz_id = excluded.fiche_quiz_id, fiche_posttest_id = excluded.fiche_posttest_id;

  delete from ressource where partie_id = v_id;
  for r in select * from jsonb_array_elements(coalesce(p -> 'ressources', '[]')) loop
    i := i + 1;
    if coalesce(trim(r ->> 'contenu'), '') <> '' then
      insert into ressource (partie_id, ordre, titre, langage, contenu)
      values (v_id, i, coalesce(nullif(trim(r ->> 'titre'), ''), 'Code ' || i), nullif(trim(coalesce(r ->> 'langage', '')), ''), r ->> 'contenu');
    end if;
  end loop;

  perform appliquer_deroule(g.id) from groupe g where g.atelier_id = x.atelier_id;
  return v_id;
end $$;

create or replace function supprimer_partie(p_partie uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_atelier uuid;
begin
  select atelier_id into v_atelier from partie where id = p_partie;
  if v_atelier is null then return; end if;
  if not est_admin_camp((select camp_id from atelier where id = v_atelier)) then raise exception 'droits:Seul un admin du camp gère les parties'; end if;
  -- les activités pas encore commencées disparaissent ; les autres restent, sans partie
  delete from participant_session ps using session_evaluation s
    where ps.session_id = s.id and s.partie_id = p_partie and not exists (select 1 from tentative t where t.session_id = s.id);
  delete from session_evaluation s where s.partie_id = p_partie and not exists (select 1 from tentative t where t.session_id = s.id);
  delete from partie where id = p_partie;
end $$;

-- Un formateur peut aussi rattacher une activité ajoutée à la main à une partie
create or replace function ajouter_activite(p_groupe uuid, p_fiche uuid, p_partie uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f fiche;
begin
  if not peut_piloter(p_groupe) then raise exception 'droits:Ce groupe n’est pas le vôtre'; end if;
  select * into f from fiche where id = p_fiche;
  if f.id is null then raise exception 'droits:Fiche introuvable'; end if;
  if not peut_programmer(f) then raise exception 'droits:Cette fiche doit d’abord être validée par un admin'; end if;
  if p_partie is not null and not exists (select 1 from partie p join groupe g on g.atelier_id = p.atelier_id where p.id = p_partie and g.id = p_groupe) then
    raise exception 'droits:Cette partie n’appartient pas à l’atelier';
  end if;
  insert into session_evaluation (fiche_id, groupe_id, partie_id, mode, mode_correction, statut, classement_affiche, etape)
  values (p_fiche, p_groupe, p_partie, 'libre', f.mode_correction, 'brouillon', f.type <> 'satisfaction', 'attente');
end $$;

-- ---------------------------------------------------------------------
-- Lectures enrichies des parties
-- ---------------------------------------------------------------------
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
          'parties', j_parties(a.id, g.statut <> 'a_venir'),
          'activites', coalesce((
            select jsonb_agg(
              j_detail_session(s.id) || jsonb_build_object(
                'nb_questions', (select count(*) from fiche_question fq where fq.fiche_id = s.fiche_id),
                'tentative', (select to_jsonb(tt) from tentative tt where tt.session_id = s.id and tt.eleve_id = v_eleve))
              order by p.ordre nulls last, ordre_deroule(f.type), s.cree_le)
            from session_evaluation s join fiche f on f.id = s.fiche_id
            left join partie p on p.id = s.partie_id
            where s.groupe_id = g.id), '[]')) as j
      from inscription i
      join groupe g on g.id = i.groupe_id
      join atelier a on a.id = g.atelier_id
      join camp c on c.id = a.camp_id
      join technologie t on t.id = a.technologie_id
      where i.eleve_id = v_eleve and c.statut <> 'termine') x), '[]'));
end $$;

-- Progression pré → post : dans la même partie
create or replace function progression(p_session uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(f.type, jsonb_build_object('score', coalesce(t.score, 0), 'score_max', coalesce(t.score_max, 0))), '{}')
  from session_evaluation s0
  join session_evaluation s on s.groupe_id = s0.groupe_id and s.partie_id is not distinct from s0.partie_id
  join fiche f on f.id = s.fiche_id and f.type in ('pretest', 'posttest')
  join tentative t on t.session_id = s.id and t.eleve_id = eleve_courant() and t.statut <> 'en_cours'
  where s0.id = p_session
$$;

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
    'parties', j_parties(g.atelier_id, true),
    'activites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'session', to_jsonb(s), 'fiche', to_jsonb(f),
        'nb_questions', (select count(*) from fiche_question fq where fq.fiche_id = f.id),
        'nb_soumises', (select count(*) from tentative t where t.session_id = s.id and t.statut <> 'en_cours'),
        'nb_en_cours', (select count(*) from tentative t where t.session_id = s.id and t.statut = 'en_cours'))
        order by p.ordre nulls last, ordre_deroule(f.type), s.cree_le)
      from session_evaluation s join fiche f on f.id = s.fiche_id left join partie p on p.id = s.partie_id
      where s.groupe_id = p_groupe), '[]')));
end $$;

create or replace function structure_camp(p_camp uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_admin_camp(p_camp) then raise exception 'droits:Réservé aux admins de ce camp'; end if;
  return jsonb_strip_nulls(coalesce((
    select jsonb_agg(x.j order by x.cle nulls last) from (
      select (select min(g.date::text || ' ' || to_char(g.heure_debut, 'HH24:MI')) from groupe g where g.atelier_id = a.id) as cle,
        jsonb_build_object('atelier', to_jsonb(a), 'technologie', to_jsonb(t), 'parties', j_parties(a.id, true), 'groupes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'groupe', j_groupe(g),
            'formateurs', coalesce((select jsonb_agg(jsonb_build_object('utilisateur', to_jsonb(u), 'role', gf.role) order by gf.role, u.nom)
                                    from groupe_formateur gf join utilisateur u on u.id = gf.utilisateur_id where gf.groupe_id = g.id), '[]'),
            'nb_eleves', (select count(*) from inscription i where i.groupe_id = g.id)) order by g.date, g.heure_debut)
          from groupe g where g.atelier_id = a.id), '[]')) as j
      from atelier a join technologie t on t.id = a.technologie_id where a.camp_id = p_camp) x), '[]'));
end $$;

-- ---------------------------------------------------------------------
-- Export des résultats d'un camp : une ligne par élève inscrit et par activité notée
-- ---------------------------------------------------------------------
create or replace function export_resultats(p_camp uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_admin_camp(p_camp) then raise exception 'droits:Réservé aux admins de ce camp'; end if;
  return jsonb_strip_nulls(coalesce((
    select jsonb_agg(jsonb_build_object(
      'eleve', to_jsonb(e),
      'ecole', (select ec.nom from ecole ec where ec.id = e.ecole_id),
      'atelier', a.titre_fr, 'groupe', g.nom, 'date', g.date,
      'partie', p.titre_fr, 'partie_ordre', p.ordre,
      'type', f.type, 'fiche', f.titre_fr,
      'score', t.score, 'score_max', t.score_max, 'temps_total_ms', t.temps_total_ms, 'statut', t.statut)
      order by g.date, a.titre_fr, g.nom, e.nom, e.prenom, p.ordre nulls last, ordre_deroule(f.type))
    from atelier a
    join groupe g on g.atelier_id = a.id
    join inscription i on i.groupe_id = g.id
    join eleve e on e.id = i.eleve_id
    join session_evaluation s on s.groupe_id = g.id
    join fiche f on f.id = s.fiche_id and f.type in ('pretest', 'quiz', 'posttest')
    left join partie p on p.id = s.partie_id
    left join tentative t on t.session_id = s.id and t.eleve_id = e.id
    where a.camp_id = p_camp), '[]'));
end $$;

-- ---------------------------------------------------------------------
-- Droits : nouvelle liste blanche complète
-- (une fonction créée reçoit par défaut le droit d'exécution pour tous)
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  -- élèves
  connexion_eleve(text), changer_langue(langue_interface), ateliers_eleve(), charger_session(uuid),
  demarrer_tentative(uuid, langue_interface), enregistrer_reponse(uuid, uuid, uuid[], text, int),
  soumettre_tentative(uuid), tentative_de(uuid), progression(uuid), classement(uuid, int),
  rejoindre_pilote(uuid, langue_interface), repondre_pilote(uuid, uuid, uuid[], text), etat_pilote(uuid),
  classement_en_direct(uuid, int),
  -- comptes du personnel
  mon_profil(), creer_mon_profil(text, text, text), liste_personnel(), attribuer_role(uuid, role_utilisateur, uuid), retirer_role(uuid),
  -- pilotage
  groupes_personnel(), detail_groupe(uuid), resultats_session(uuid), changer_statut_groupe(uuid, statut_groupe),
  changer_statut_session(uuid, statut_session), changer_affichage_classement(uuid, boolean), changer_mode_session(uuid, mode_session),
  piloter(uuid, text), ajouter_activite(uuid, uuid), ajouter_activite(uuid, uuid, uuid), retirer_activite(uuid),
  -- fiches
  fiches_visibles(), charger_fiche(uuid), enregistrer_fiche(jsonb), dupliquer_fiche(uuid), soumettre_fiche(uuid),
  valider_fiche(uuid), refuser_fiche(uuid, text), supprimer_fiche(uuid),
  -- camp
  camps(), enregistrer_camp(jsonb), structure_camp(uuid), enregistrer_atelier(jsonb), enregistrer_groupe(jsonb, jsonb),
  supprimer_groupe(uuid), formateurs(), eleves_camp(uuid), enregistrer_eleve(uuid, jsonb, jsonb, uuid[]),
  importer_eleves(uuid, jsonb, uuid[], text),
  enregistrer_partie(jsonb), supprimer_partie(uuid), export_resultats(uuid),
  -- référentiels
  ecoles(), langues(), identites_eleves(), technologies(), competences(uuid), ajouter_competence(uuid, text, text)
to authenticated;
