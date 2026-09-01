#!/usr/bin/env bash
# Local PostgreSQL cluster for InvoNotify development.
#
# Runs entirely as your own user -- no root, no Docker, no Neon. The cluster
# lives in .local-db/pgdata (gitignored) and listens on 127.0.0.1:5433 so it
# cannot collide with a system postgres on 5432.
#
#   ./scripts/local-db.sh start     # start in the background (creates the cluster on first run)
#   ./scripts/local-db.sh run       # start in the FOREGROUND (Ctrl-C to stop)
#   ./scripts/local-db.sh stop
#   ./scripts/local-db.sh status
#   ./scripts/local-db.sh psql      # open a shell on the invonotify database
#   ./scripts/local-db.sh reset     # DESTROY and rebuild the cluster from scratch
#
# After `start`, apply the schema and seed demo data:
#   npx prisma migrate deploy && npx prisma generate
#   node --import tsx scripts/ai/seed-recovery-data.ts
#
# .env.local already points DATABASE_URL/DIRECT_URL at this cluster.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="$ROOT/.local-db/pgdata"
LOGFILE="$ROOT/.local-db/postgres.log"
PORT=5433
DB=invonotify

# Prefer a versioned Debian/Ubuntu install, fall back to whatever is on PATH.
if [ -d /usr/lib/postgresql ]; then
  PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
else
  PGBIN="$(dirname "$(command -v pg_ctl)")"
fi

if [ ! -x "$PGBIN/pg_ctl" ]; then
  echo "postgres server binaries not found. Install them first:" >&2
  echo "  Ubuntu/Debian: sudo apt install postgresql" >&2
  echo "  macOS:         brew install postgresql@16" >&2
  exit 1
fi

# Unix sockets are disabled: some sandboxed/containerised filesystems refuse
# socket creation, and TCP on loopback works everywhere.
PGOPTS="-p $PORT -c unix_socket_directories='' -c listen_addresses=127.0.0.1"

is_up() { "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PORT" -q 2>/dev/null; }

url() { echo "postgresql://postgres@127.0.0.1:$PORT/$DB?sslmode=disable"; }

do_init() {
  [ -f "$PGDATA/PG_VERSION" ] && return 0
  echo "Creating cluster in $PGDATA ..."
  mkdir -p "$(dirname "$PGDATA")"
  "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 >/dev/null
}

do_start() {
  do_init
  if is_up; then echo "Already running on 127.0.0.1:$PORT"; return 0; fi
  # A stale pidfile from a hard kill blocks startup; safe to drop when nothing listens.
  rm -f "$PGDATA/postmaster.pid"
  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$LOGFILE" -o "$PGOPTS" start >/dev/null
  for _ in $(seq 1 20); do is_up && break; sleep 0.5; done
  if ! is_up; then echo "Failed to start. Last log lines:" >&2; tail -15 "$LOGFILE" >&2; exit 1; fi

  if ! "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
    "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -q \
      -c "CREATE DATABASE $DB;"
    echo "Created database $DB"
  fi
  echo "PostgreSQL up on 127.0.0.1:$PORT"
  echo "DATABASE_URL=$(url)"
}

do_run() {
  do_init
  if is_up; then
    echo "Already running on 127.0.0.1:$PORT" >&2
    exit 1
  fi
  rm -f "$PGDATA/postmaster.pid"
  # `exec` below replaces this shell, so the application database has to be
  # created from a background subshell that waits for the postmaster to accept
  # connections. Exits quietly if the server never comes up -- the foreground
  # postmaster will have already printed the reason.
  (
    for _ in $(seq 1 40); do is_up && break; sleep 0.5; done
    is_up || exit 0
    if ! "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -tAc \
        "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
      "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -q \
        -c "CREATE DATABASE $DB;"
      echo "Created database $DB"
    fi
    echo "PostgreSQL ready on 127.0.0.1:$PORT (database: $DB)"
  ) &
  exec "$PGBIN/postgres" -D "$PGDATA" -p "$PORT" \
    -c unix_socket_directories='' -c listen_addresses=127.0.0.1
}

case "${1:-start}" in
  start)  do_start ;;
  run)    do_run ;;
  stop)
    if [ -f "$PGDATA/PG_VERSION" ]; then
      "$PGBIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
    fi
    echo "Stopped." ;;
  status)
    if is_up; then echo "running on 127.0.0.1:$PORT"; else echo "not running"; fi ;;
  psql)
    do_start >/dev/null
    exec "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d "$DB" ;;
  url)  url ;;
  reset)
    printf 'This DESTROYS %s and all local data. Continue? [y/N] ' "$PGDATA"
    read -r reply
    case "$reply" in
      y|Y)
        "$PGBIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
        rm -rf "$PGDATA"
        do_start ;;
      *) echo "Aborted." ;;
    esac ;;
  *)
    echo "usage: $0 {start|run|stop|status|psql|url|reset}" >&2; exit 2 ;;
esac
