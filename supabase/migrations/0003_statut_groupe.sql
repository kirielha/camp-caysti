-- Statut d'un groupe d'atelier, piloté par le formateur.
-- Tant qu'il est « a_venir », l'élève voit l'atelier mais ne peut faire aucune activité.
create type statut_groupe as enum ('a_venir', 'en_cours', 'termine');
alter table groupe add column statut statut_groupe not null default 'a_venir';

-- Même règle côté serveur : une tentative ne peut démarrer que si l'atelier est en cours
-- et l'activité ouverte (l'interface grise déjà les boutons, la base le garantit).
create or replace function verifier_tentative_autorisee() returns trigger language plpgsql as $$
declare
  v_statut_groupe statut_groupe;
  v_statut_session statut_session;
begin
  select g.statut, s.statut into v_statut_groupe, v_statut_session
  from session_evaluation s join groupe g on g.id = s.groupe_id
  where s.id = new.session_id;
  if v_statut_groupe is distinct from 'en_cours' then
    raise exception 'atelier_inactif' using hint = 'L''atelier n''a pas démarré ou est terminé';
  end if;
  if v_statut_session is distinct from 'ouverte' then
    raise exception 'session_fermee' using hint = 'Cette activité n''est pas ouverte';
  end if;
  return new;
end $$;

create trigger tentative_autorisee before insert on tentative
  for each row execute function verifier_tentative_autorisee();
