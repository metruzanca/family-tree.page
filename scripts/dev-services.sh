#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p .dev

PGDATA=".dev/postgres"
PGPORT="${PGPORT:-5432}"
S3_PORT="${S3_PORT:-9000}"
S3_PID_FILE=".dev/s3.pid"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing '$1'. Enter the dev shell first: nix-shell"
    exit 1
  fi
}

start_postgres() {
  require pg_ctl
  require initdb
  require createdb

  if [ -f "$PGDATA/PG_VERSION" ]; then
    local current_version
    current_version="$(cat "$PGDATA/PG_VERSION")"
    if [ "$current_version" != "18" ]; then
      echo "Local Postgres data is version $current_version, but this shell uses 18."
      echo "Reset the disposable local cluster with: pnpm dev:reset-db"
      exit 1
    fi
  fi

  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "Initializing local Postgres in $PGDATA"
    initdb -D "$PGDATA" -U family_tree --auth=trust --locale=C --encoding=UTF8 > .dev/initdb.log 2>&1
  fi

  if ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    echo "Starting Postgres on port $PGPORT"
    pg_ctl -D "$PGDATA" -l .dev/postgres.log \
      -o "-p $PGPORT -k /tmp -h 127.0.0.1" start
  else
    echo "Postgres already running"
  fi

  createdb -h 127.0.0.1 -p "$PGPORT" -U family_tree family_tree 2>/dev/null || true
}

start_storage() {
  if curl -fsS -o /dev/null "http://127.0.0.1:$S3_PORT/family-tree/" 2>/dev/null; then
    echo "Local S3 already running on port $S3_PORT"
    return
  fi

  echo "Starting local S3 on port $S3_PORT"
  nohup pnpm exec tsx scripts/dev-s3.ts > .dev/s3.log 2>&1 &
  echo $! > "$S3_PID_FILE"

  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null "http://127.0.0.1:$S3_PORT/family-tree/" 2>/dev/null; then
      return
    fi
    sleep 0.2
  done

  echo "Local S3 did not start. Check .dev/s3.log"
  exit 1
}

stop_all() {
  if command -v pg_ctl >/dev/null 2>&1 && [ -f "$PGDATA/PG_VERSION" ]; then
    pg_ctl -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true
    echo "Postgres stopped"
  fi

  if [ -f "$S3_PID_FILE" ]; then
    kill "$(cat "$S3_PID_FILE")" 2>/dev/null || true
    rm -f "$S3_PID_FILE"
    echo "Local S3 stopped"
  fi
}

reset_database() {
  if command -v pg_ctl >/dev/null 2>&1 && [ -f "$PGDATA/PG_VERSION" ]; then
    pg_ctl -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true
  fi
  rm -rf "$PGDATA"
  echo "Removed the local Postgres cluster."
  start_postgres
  echo
  echo "Local Postgres is ready. Restore production data with: pnpm db:pull"
}

status_all() {
  if command -v pg_ctl >/dev/null 2>&1 && pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    echo "Postgres: running on port $PGPORT"
  else
    echo "Postgres: stopped"
  fi

  if curl -fsS -o /dev/null "http://127.0.0.1:$S3_PORT/family-tree/" 2>/dev/null; then
    echo "Local S3: running on port $S3_PORT"
  else
    echo "Local S3: stopped"
  fi
}

case "${1:-start}" in
  start)
    start_postgres
    start_storage
    echo
    echo "Dev services ready. Next: pnpm db:migrate && pnpm dev"
    ;;
  stop)
    stop_all
    ;;
  status)
    status_all
    ;;
  reset)
    reset_database
    ;;
  *)
    echo "Usage: $0 [start|stop|status|reset]"
    exit 1
    ;;
esac
