#!/usr/bin/env sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_directory=$(dirname "$script_directory")
node_bin_directory=$(dirname "$(command -v node)")
current_crontab=$(mktemp)
next_crontab=$(mktemp)

cleanup() {
  rm -f "$current_crontab" "$next_crontab"
}
trap cleanup EXIT

crontab -l > "$current_crontab" 2>/dev/null || true

awk '
  $0 == "# BEGIN mercado-sync" { skipping = 1; next }
  $0 == "# END mercado-sync" { skipping = 0; next }
  !skipping { print }
' "$current_crontab" > "$next_crontab"

{
  echo "# BEGIN mercado-sync"
  echo "CRON_TZ=Europe/Lisbon"
  echo "PATH=$node_bin_directory:/usr/local/bin:/usr/bin:/bin"
  echo "0 3 * * * $project_directory/scripts/run-daily-sync.sh # mercado-sync"
  echo "# END mercado-sync"
} >> "$next_crontab"

crontab "$next_crontab"
echo "Cron instalado: todos os dias às 03:00 (Europe/Lisbon)."
