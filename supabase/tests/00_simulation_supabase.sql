-- Reproduit, sur un PostgreSQL ordinaire, ce que Supabase fournit et dont les migrations dépendent.
-- Sert uniquement aux tests locaux (jamais à exécuter sur Supabase).
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;

create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;

create schema realtime;
create table realtime.journal (topic text, payload jsonb, envoye_le timestamptz default clock_timestamp());
create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void
language sql as $$ insert into realtime.journal (topic, payload) values (topic, payload) $$;

create schema extensions;
grant usage on schema extensions to anon, authenticated;
