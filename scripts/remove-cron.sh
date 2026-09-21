#!/usr/bin/env sh
set -eu

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
crontab "$next_crontab"

echo "Cron diário do Mercado removido."
