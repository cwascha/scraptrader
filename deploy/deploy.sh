#!/usr/bin/env bash
# ScrapTrader — deploy a new release.
#
#   sudo -u scraptrader /srv/scraptrader/deploy.sh
#
# Releases are timestamped directories with a `current` symlink, so a bad
# deploy is a symlink swap away from being undone (see rollback.sh).
#
# What is deliberately NOT in a release directory:
#   - the SQLite database  (/var/scraptrader/data)
#   - uploaded images      (/var/scraptrader/uploads)
# Both live outside the repo and are symlinked in. A release that wiped
# every deal photo would be an unrecoverable "deploy".
set -euo pipefail

REPO="${REPO:-https://github.com/rossl/scraptrader.git}"
BRANCH="${BRANCH:-main}"
ROOT=/srv/scraptrader
SHARED=/var/scraptrader
RELEASES="$ROOT/releases"
STAMP="$(date +%Y%m%d-%H%M%S)"
NEW="$RELEASES/$STAMP"

echo "==> Fetching $BRANCH into $NEW"
mkdir -p "$RELEASES"
git clone --depth 1 --branch "$BRANCH" "$REPO" "$NEW"

cd "$NEW"

echo "==> Linking shared state"
ln -sfn "$SHARED/data/prod.db" "$NEW/prod.db"
mkdir -p "$NEW/public"
ln -sfn "$SHARED/uploads" "$NEW/public/uploads"
ln -sfn /etc/scraptrader/env "$NEW/.env"

echo "==> Installing dependencies"
npm ci --omit=dev --ignore-scripts
# Prisma's engines and sharp's binaries DO need their install scripts;
# allowScripts in package.json is the allowlist, so run them explicitly.
npm rebuild sharp
npx prisma generate

echo "==> Applying migrations"
# `migrate deploy` applies committed migrations only — it never generates
# or resets, which is what you want on a database holding real contacts.
npx prisma migrate deploy

echo "==> Building"
# The build needs devDependencies; install them, build, then prune.
npm ci --ignore-scripts
npm rebuild sharp
npx prisma generate
npm run build
npm prune --omit=dev

echo "==> Switching symlink"
ln -sfn "$NEW" "$ROOT/current"

echo "==> Restarting service"
sudo systemctl restart scraptrader

echo "==> Waiting for health"
for i in {1..30}; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/login; then
    echo "    up after ${i}s"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "FAILED: app did not come up. Check: journalctl -u scraptrader -n 50" >&2
    exit 1
  fi
  sleep 1
done

echo "==> Pruning old releases (keeping 5)"
ls -1dt "$RELEASES"/*/ | tail -n +6 | xargs -r rm -rf

echo "==> Done: $STAMP"
