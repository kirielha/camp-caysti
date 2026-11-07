#!/usr/bin/env bash
# Rejoue toutes les migrations puis les tests SQL sur un PostgreSQL local jetable.
# Prérequis : PostgreSQL 15+ (initdb, pg_ctl, psql) et l'extension unaccent (paquet postgresql-contrib).
# Usage : scripts/tester-sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
BIN=${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}
DIR=$(mktemp -d)
PORT=${PG_PORT:-5499}
trap '"$BIN/pg_ctl" -D "$DIR/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"$BIN/pg_ctl" -D "$DIR/data" -o "-k $DIR -p $PORT -c listen_addresses=''" -l "$DIR/pg.log" start >/dev/null
for i in $(seq 1 30); do "$BIN/pg_isready" -h "$DIR" -p "$PORT" >/dev/null 2>&1 && break; sleep 0.2; done
PSQL=("$BIN/psql" -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f supabase/tests/00_simulation_supabase.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f supabase/tests/01_outils.sql
"${PSQL[@]}" -f supabase/tests/10_scenario.sql 2>&1 | sed 's/^psql:[^:]*:[0-9]*: //'
