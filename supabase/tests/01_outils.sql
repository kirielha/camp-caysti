-- Outils de test : changer d'utilisateur, vérifier, capturer une erreur
create schema test;
grant usage on schema test to authenticated;

create function test.comme(p_uid uuid, p_anonyme boolean default false) returns void
language sql as $$
  select set_config('test.uid', coalesce(p_uid::text, ''), false), set_config('test.jwt', json_build_object('is_anonymous', p_anonyme)::text, false);
$$;

create function test.ok(p_condition boolean, p_message text) returns void
language plpgsql as $$
begin
  if not coalesce(p_condition, false) then raise exception 'ÉCHEC : %', p_message; end if;
  raise notice 'ok  %', p_message;
end $$;

create function test.erreur(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

grant execute on all functions in schema test to authenticated;
