#!/usr/bin/env bash
# Roll back to the previous release.
#
#   sudo -u scraptrader /srv/scraptrader/rollback.sh
#
# ⚠ CODE ONLY. This does NOT undo database migrations. If the release you
# are rolling back from applied a destructive migration (dropped a column,
# changed a type), the older code may not run against the new schema.
# Restore the database from backup in that case — see deploy/README.md.
#
# Additive migrations (new nullable columns/tables), which is what this
# project has used so far, roll back cleanly.
set -euo pipefail

ROOT=/srv/scraptrader
RELEASES="$ROOT/releases"

CURRENT="$(readlink -f "$ROOT/current")"
PREVIOUS="$(ls -1dt "$RELEASES"/*/ | sed -n 2p)"

if [[ -z "$PREVIOUS" ]]; then
  echo "No previous release to roll back to." >&2
  exit 1
fi

echo "Current:  $CURRENT"
echo "Rollback: $PREVIOUS"
read -rp "Proceed? [y/N] " ok
[[ "$ok" == "y" ]] || exit 0

ln -sfn "${PREVIOUS%/}" "$ROOT/current"
sudo systemctl restart scraptrader

for i in {1..30}; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/login; then
    echo "Rolled back and healthy."
    exit 0
  fi
  sleep 1
done

echo "WARNING: rolled back but the app is not responding. journalctl -u scraptrader -n 50" >&2
exit 1
