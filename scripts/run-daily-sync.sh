#!/usr/bin/env sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_directory=$(dirname "$script_directory")
log_directory="$project_directory/logs"
log_file="$log_directory/daily-sync.log"

mkdir -p "$log_directory"
cd "$project_directory"
node scripts/rotate-logs.js "$log_file"

{
  echo "[$(date -Iseconds)] início da sincronização diária"
  docker compose up -d postgres
  npm run db:migrate
  npm run sync:daily
  echo "[$(date -Iseconds)] sincronização diária concluída"
} >> "$log_file" 2>&1
