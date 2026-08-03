#!/usr/bin/env bash
# Nightly backup: SQLite database + uploaded images.
#
# Install:  /etc/cron.daily/scraptrader-backup  (chmod +x)
#
# ⚠ READ THIS BEFORE CHANGING ANYTHING HERE.
#
# The backup deliberately does NOT include ENCRYPTION_MASTER_KEY, and it
# must never start doing so. Contact PII is encrypted under a per-account
# key that is itself wrapped by that master key. Put both in one archive
# and envelope encryption buys you nothing — the thing it protects against
# is exactly "someone got a copy of the database".
#
# The master key belongs in a password manager, off this droplet. If you
# lose it, these backups are permanently unreadable. That is the trade.
set -euo pipefail

SHARED=/var/scraptrader
DEST="$SHARED/backups"
KEEP_DAYS=14
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DEST"

# `.backup` is the only safe way to copy a live SQLite file — cp can catch
# a write mid-transaction and produce a corrupt database that restores
# without complaint.
sqlite3 "$SHARED/data/prod.db" ".backup '$DEST/prod-$STAMP.db'"
gzip -f "$DEST/prod-$STAMP.db"

# Uploads: incremental mirror, plus a weekly archive on Sundays.
rsync -a --delete "$SHARED/uploads/" "$DEST/uploads-mirror/"
if [[ "$(date +%u)" == "7" ]]; then
  tar -czf "$DEST/uploads-$STAMP.tar.gz" -C "$SHARED" uploads
fi

find "$DEST" -name 'prod-*.db.gz'    -mtime "+$KEEP_DAYS" -delete
find "$DEST" -name 'uploads-*.tar.gz' -mtime +60          -delete

# --- Off-box copy --------------------------------------------------------
# Everything above still lives on the droplet, so it survives a bad deploy
# but NOT a lost droplet. Uncomment once a remote is configured (rclone to
# B2/S3 costs pennies a month at this size).
#
# rclone copy "$DEST" remote:scraptrader-backups --max-age 25h
#
# Sanity check worth running by hand every so often — an untested backup
# is a hypothesis:
#   gunzip -c prod-XXXX.db.gz > /tmp/t.db && sqlite3 /tmp/t.db "pragma integrity_check;"

echo "backup ok: $STAMP"
