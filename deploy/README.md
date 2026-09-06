# Deploying ScrapTrader

Single droplet, single Node process, SQLite on local disk, nginx in front.
Roughly **$15/month** all-in.

This layout is not arbitrary — the app keeps in-memory state (rate-limit
buckets, the Tier-3 nudge sweeper) and writes uploads to disk, so it must
run as **one long-lived process**. Do not add a second worker or a cluster:
two sweepers send duplicate digests and per-process rate limits count to
N× the intended ceiling.

---

## 1. Droplet

**2 GB minimum.** `next build` OOMs on 1 GB. If you insist on the $6 tier,
add swap first:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Base setup as root:

```bash
apt update && apt upgrade -y
apt install -y nginx git sqlite3 rsync ufw
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs

adduser --system --group --home /srv/scraptrader scraptrader

ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

## 2. Directories

Shared state lives **outside** the release directories so a deploy can
never destroy it:

```bash
mkdir -p /srv/scraptrader/releases
mkdir -p /var/scraptrader/{data,uploads,backups}
mkdir -p /etc/scraptrader /var/www/certbot
chown -R scraptrader:scraptrader /srv/scraptrader /var/scraptrader
```

## 3. DNS

At GoDaddy, on `thescraptrader.com`:

| Type | Name | Value |
|---|---|---|
| A | `@` | your droplet IP |
| A | `www` | your droplet IP |

**Leave the MX records alone** — they point at Google Workspace and are how
`deals@thescraptrader.com` receives mail. GoDaddy's Name field is relative:
type `@` and `www`, not the full domain.

## 4. Secrets

The master key goes in its own root-owned file, **not** in `.env`:

```bash
# Use the SAME value as dev if you're migrating dev.db up; generate a new
# one only for a fresh database.
printf '%s' 'YOUR-MASTER-KEY' > /etc/scraptrader/master_key
chmod 600 /etc/scraptrader/master_key
```

Then `/etc/scraptrader/env`:

```
NODE_ENV=production
PORT=3000
DATABASE_URL="file:/var/scraptrader/data/prod.db"
NEXTAUTH_URL="https://thescraptrader.com"
NEXTAUTH_SECRET="<openssl rand -base64 48>"
SMTP_HOST="email-smtp.us-east-1.amazonaws.com"
SMTP_PORT="587"
SMTP_USER="<ses smtp user>"
SMTP_PASS="<ses smtp password>"
SMTP_FROM="ScrapTrader <deals@mail.thescraptrader.com>"
```

```bash
chown root:scraptrader /etc/scraptrader/env && chmod 640 /etc/scraptrader/env
```

**`ENCRYPTION_MASTER_KEY` must NOT appear in this file.** systemd injects it
from the credential (`deploy/start.sh`), which keeps it out of droplet
snapshots and off the app's own filesystem. Back it up in a password
manager — **losing it makes all contact data permanently unrecoverable**.

## 5. Service

```bash
cp deploy/scraptrader.service /etc/systemd/system/
chmod +x /srv/scraptrader/current/deploy/*.sh
systemctl daemon-reload && systemctl enable --now scraptrader
journalctl -u scraptrader -f
```

## 6. nginx + TLS

```bash
cp deploy/nginx-scraptrader.conf /etc/nginx/sites-available/scraptrader
cp deploy/scraptrader-proxy.conf /etc/nginx/snippets/
ln -s /etc/nginx/sites-available/scraptrader /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
```

Add to the `http {}` block of `/etc/nginx/nginx.conf` (the proxy snippet
references it):

```nginx
map $http_upgrade $http_connection_upgrade { default upgrade; '' close; }
```

```bash
nginx -t && systemctl reload nginx
apt install -y certbot python3-certbot-nginx
certbot --nginx -d thescraptrader.com -d www.thescraptrader.com
```

Certbot installs its own renewal timer. Verify: `certbot renew --dry-run`.

## 7. Deploy

```bash
cp deploy/deploy.sh deploy/rollback.sh /srv/scraptrader/
chmod +x /srv/scraptrader/*.sh
sudo -u scraptrader /srv/scraptrader/deploy.sh
```

Rollback swaps the symlink back: `sudo -u scraptrader /srv/scraptrader/rollback.sh`
— **code only, it does not undo migrations.**

## 8. Backups

```bash
cp deploy/backup.sh /etc/cron.daily/scraptrader-backup
chmod +x /etc/cron.daily/scraptrader-backup
```

Also enable DigitalOcean weekly snapshots (~$2.40/mo).

**Keep the master key somewhere the backups aren't.** A snapshot containing
both the database and the key defeats the entire point of envelope
encryption.

## 9. Migrating dev data up

Only if you want the existing dev database:

```bash
# locally
scp dev.db root@DROPLET:/var/scraptrader/data/prod.db
```

Use the **same** `ENCRYPTION_MASTER_KEY` — the per-account keys in that
file are wrapped under it, and a different key means unreadable contacts.

---

## Post-deploy checklist

- [ ] `https://thescraptrader.com` loads, TLS valid
- [ ] Log in; contacts show real names (proves the master key is reaching the process)
- [ ] Publish a deal to yourself — email arrives, logo renders (proves `NEXTAUTH_URL`)
- [ ] Open a buyer link, send a message
- [ ] Upload a deal photo, confirm it survives a second `deploy.sh`
- [ ] `curl -H 'X-Forwarded-For: 1.2.3.4' ...` — rate limits must key off the real IP, not the header
- [ ] Add to Home Screen on a phone; check the icon is Ruby's
- [ ] Run the backup by hand, then restore the .db to /tmp and `pragma integrity_check`

## Gaps this closes

**#22** (nginx: XFF overwrite, body caps, nosniff), **#29** (master key off
the app host via LoadCredential), **#39** (transactional email — set the
SMTP vars to SES/Postmark; also add the `mail.` subdomain DKIM/SPF records
at GoDaddy). **#3** (uploads on persistent disk) is handled by the
`/var/scraptrader/uploads` symlink.

Still open after this: **#41** (uploads are public to anyone with the URL)
and **#10** (no bounce tracking).
