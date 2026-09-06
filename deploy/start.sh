#!/usr/bin/env bash
# Launch wrapper for the systemd unit.
#
# Sole purpose: lift ENCRYPTION_MASTER_KEY out of the systemd credential
# file (a tmpfs at $CREDENTIALS_DIRECTORY, readable only by this service)
# into the process environment, then exec the server.
#
# Why not just put the key in EnvironmentFile? Because that file is on
# disk, in droplet snapshots, and beside the database. Keeping the key out
# of both means a stolen DB *or* a stolen backup is useless on its own —
# see ARCHITECTURE gaps #1 and #29.
set -euo pipefail

if [[ -n "${CREDENTIALS_DIRECTORY:-}" && -r "${CREDENTIALS_DIRECTORY}/master_key" ]]; then
  ENCRYPTION_MASTER_KEY="$(< "${CREDENTIALS_DIRECTORY}/master_key")"
  export ENCRYPTION_MASTER_KEY
fi

# Fail loudly rather than booting an app that can't read its own contacts.
# lib/master-key.ts also throws in production, but catching it here gives a
# clearer journal entry than a stack trace.
if [[ -z "${ENCRYPTION_MASTER_KEY:-}" ]]; then
  echo "FATAL: ENCRYPTION_MASTER_KEY not available. Check /etc/scraptrader/master_key and the LoadCredential= line." >&2
  exit 1
fi

exec npm run start
