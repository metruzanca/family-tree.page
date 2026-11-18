# Operations

Deploying, configuring, and running the app: environment variables, Railway, backups, logging, analytics, quotas, and privacy.

## Environment

Copy `.env.example` to `.env`. The important variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | 32+ random characters used to encrypt session cookies |
| `APP_URL` | Local development origin fallback for email links. Railway sets `RAILWAY_PUBLIC_DOMAIN` in production |
| `RESEND_API_KEY` | Resend API key used for verification, reset, invitation, and birthday emails |
| `RESEND_FROM_EMAIL` | Sender identity, for example `family-tree <hello@your-domain.tld>` |
| `BIRTHDAY_EMAILS` | Set to `off` to disable the birthday email scheduler, or `on` to enable it in development |
| `BIRTHDAY_EMAIL_HOUR_UTC` | UTC hour after which birthday emails are sent each day, default `8` |
| `S3_ENDPOINT` | S3 API endpoint |
| `S3_REGION` | Bucket region |
| `S3_BUCKET` | Bucket name |
| `S3_ACCESS_KEY_ID` | Bucket access key |
| `S3_SECRET_ACCESS_KEY` | Bucket secret |
| `S3_FORCE_PATH_STYLE` | `true` for local s3rver, `false` for Railway buckets |
| `BACKUP_S3_ENDPOINT` | Backup bucket endpoint |
| `BACKUP_S3_REGION` | Backup bucket region |
| `BACKUP_S3_BUCKET` | Backup bucket name |
| `BACKUP_S3_ACCESS_KEY_ID` | Backup bucket access key |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Backup bucket secret |
| `BACKUP_S3_FORCE_PATH_STYLE` | `true` for local s3rver, `false` for Railway buckets |
| `BACKUP_MEDIA` | Set to `off` to back up PostgreSQL only |
| `LOG_LEVEL` | Optional log verbosity: `debug`, `info`, `warn`, or `error` |
| `SENTRY_DSN` | Optional server Sentry DSN |
| `VITE_SENTRY_DSN` | Optional browser Sentry DSN, inlined at build time |
| `SENTRY_ENVIRONMENT` / `VITE_SENTRY_ENVIRONMENT` | Optional Sentry environment labels |
| `VITE_RELEASE` | Optional browser release name |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Optional source map upload during the build |
| `UMAMI_SCRIPT_URL` | Optional Umami script URL, for example `https://analytics.example.com/script.js` |
| `UMAMI_WEBSITE_ID` | Optional Umami website ID that pairs with the script URL |
| `SUPPORT_EMAIL` | Support address shown in quota errors and the usage card |
| `ADMIN_ALERT_EMAIL` | Optional recipient for the daily abuse digest |

`UMAMI_SCRIPT_URL` and `UMAMI_WEBSITE_ID` are both optional. Set both to inject the Umami script into the document; leave either blank to disable analytics. Product events are sent through `src/lib/analytics.ts` and silently no-op when the script is absent. See [Analytics](#analytics).

`SUPPORT_EMAIL` defaults to `samuele+family-tree@zanca.dev`. It is shown when an account reaches a storage or people limit, and in the usage card in account settings.

`CORS_ORIGINS` can hold extra comma-separated origins for `pnpm storage:cors`. Production does not need it: `RAILWAY_PUBLIC_DOMAIN` supplies the public origin.

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` are optional in development. Without a key, verification, reset, and invitation emails are printed to the server console instead of being sent, so the flows still work locally. In production the sender domain must be verified in Resend first.

On Railway, `RAILWAY_PUBLIC_DOMAIN` is the source of truth for the public origin, so email links, invite links, and bucket CORS all use it (`family-tree.page` in production). `APP_URL` is only a local fallback.

## Railway deployment

Create a Railway project with:

- One app service from this repository
- One PostgreSQL service
- Two Storage Buckets: one for live media and one for backups

Keep all three in the same region. Set the app service variables with references:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
SESSION_SECRET=<generate with: openssl rand -base64 48>
APP_URL=https://<your-railway-domain>
HOST=0.0.0.0
RESEND_API_KEY=<from the Resend dashboard>
RESEND_FROM_EMAIL=family-tree <hello@your-domain.tld>
S3_ENDPOINT=${{BucketName.ENDPOINT}}
S3_REGION=${{BucketName.REGION}}
S3_BUCKET=${{BucketName.BUCKET}}
S3_ACCESS_KEY_ID=${{BucketName.ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{BucketName.SECRET_ACCESS_KEY}}
S3_FORCE_PATH_STYLE=false
LOG_LEVEL=info
SENTRY_DSN=<optional server DSN>
VITE_SENTRY_DSN=<optional browser DSN>
SENTRY_ENVIRONMENT=production
VITE_SENTRY_ENVIRONMENT=production
UMAMI_SCRIPT_URL=<optional Umami script URL>
UMAMI_WEBSITE_ID=<optional Umami website ID>
SUPPORT_EMAIL=samuele+family-tree@zanca.dev
ADMIN_ALERT_EMAIL=<optional abuse digest recipient>
```

`railway.json` configures the build, start command, health check, and the `pnpm db:migrate` pre-deploy command. The backup service is separate and uses `railway.backup.json`; see [Backups](#backups).

After a domain is assigned, apply bucket CORS with the production credentials:

```bash
railway run --service family-tree-web pnpm storage:cors
```

The script reads `RAILWAY_PUBLIC_DOMAIN` from the service, so the bucket always allows the live domain. Localhost origins are included by default.

For local development against the same bucket, add extra origins through `CORS_ORIGINS`.

## Backups

Production keeps two private Railway Storage Buckets in `iad`: the live bucket (`roots-files`) and a backup bucket (`roots-backups`). A Railway cron service, `roots-backup`, runs `pnpm backup` daily at 03:00 UTC from `Dockerfile.backup`.

### Provisioned cron service

| Setting | Value |
|---|---|
| Service | `roots-backup` |
| Schedule | `0 3 * * *`, daily at 03:00 UTC |
| Source | `metruzanca/family-tree.page`, branch `main` |
| Build | `Dockerfile.backup` |
| Start command | `pnpm backup` |
| Restart policy | `NEVER` |
| Region | `us-east4-eqdc4a` |
| Source bucket | `roots-files` in `iad` |
| Backup bucket | `roots-backups` in `iad` |

The service has no public domain and no HTTP health check. Its variables reference `Postgres`, `roots-files`, and `roots-backups`, so database and bucket credentials are resolved by Railway instead of being copied into the service.

Inspect the service and its runs:

```sh
railway status
railway logs --service roots-backup
railway redeploy --service roots-backup --yes
```

`railway redeploy` runs the backup once outside the schedule. A successful run ends with:

```text
Uploaded postgres/<timestamp>.dump (...)
Media: N copied (...), N deleted, N in source.
No expired dumps to delete.
Backup finished.
```

The first manual run on 2026-11-17 wrote a 70 KB dump, copied 48 media objects (44 MB), and finished with no errors.

### What each run does

1. Writes a compressed `pg_dump` to `postgres/<timestamp>.dump` and updates `postgres/latest.json` with the size, SHA-256, git SHA, and media status.
2. Copies media keys under `trees/` to `media/trees/` in the backup bucket. Storage keys are immutable, so only missing objects are copied.
3. Deletes backup media whose source object no longer exists, so deleted photos and accounts do not linger. That step is skipped when the source bucket is empty.
4. Deletes database dumps older than 30 days, except the first dump of each month, which is kept for 12 months.

```text
pnpm backup                   dump PostgreSQL and sync media now
pnpm backup --dry-run         show what would change
pnpm backup --skip-media      database only
pnpm backup --keep-deleted-media
pnpm backup:verify            check the latest checksum and archive
pnpm backup:restore --yes     restore the latest dump into a local database
```

`pnpm backup:verify` reads `postgres/latest.json` unless you pass `--key <object key>`. `pnpm backup:restore` refuses a remote `DATABASE_URL` and requires `--yes`. Restore into a scratch database, never production.

Media restore is manual: copy `media/trees/` from the backup bucket back to `trees/` in the live bucket with `aws s3 sync` or the Railway dashboard. Storage keys are stable, so the database rows point at the restored objects without changes.

To recreate the service from scratch:

1. Add a second Storage Bucket in the same project and region.
2. Add a service from this repository and set its config file path to `/railway.backup.json`, or set the Dockerfile path, start command, and cron schedule directly. It builds `Dockerfile.backup` and runs `pnpm backup` on the cron schedule.
3. Set these variables on the backup service:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
S3_ENDPOINT=${{roots-files.ENDPOINT}}
S3_REGION=${{roots-files.REGION}}
S3_BUCKET=${{roots-files.BUCKET}}
S3_ACCESS_KEY_ID=${{roots-files.ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{roots-files.SECRET_ACCESS_KEY}}
S3_FORCE_PATH_STYLE=false
BACKUP_S3_ENDPOINT=${{roots-backups.ENDPOINT}}
BACKUP_S3_REGION=${{roots-backups.REGION}}
BACKUP_S3_BUCKET=${{roots-backups.BUCKET}}
BACKUP_S3_ACCESS_KEY_ID=${{roots-backups.ACCESS_KEY_ID}}
BACKUP_S3_SECRET_ACCESS_KEY=${{roots-backups.SECRET_ACCESS_KEY}}
BACKUP_S3_FORCE_PATH_STYLE=false
```

4. Disable the HTTP health check and keep the restart policy at `NEVER`.
5. Enable Postgres point-in-time recovery as the first line of defense between dumps. Check it with `railway postgres pitr status --service Postgres`. Railway currently offers this only on Pro workspaces, so it stays off on the current plan.

The backup bucket is private, but the dumps are not encrypted by the app. Both buckets live in the same provider and region, so a Railway account or regional failure loses both. The upgrade path is an external S3-compatible target, `age` encryption, and object versioning.

## Logging and error tracking

The server writes structured JSON logs to stdout and stderr. Every request gets
an `x-request-id`, every server action logs its outcome, and expected failures
such as validation and permission errors are logged at `warn` instead of being
silently returned to the browser. Set `LOG_LEVEL` to `debug`, `info`, `warn`, or
`error`; production defaults to `info`. See [docs/logging.md](logging.md)
for the event catalog, privacy rules, and the support workflow.

Railway runtime logs are short-lived. Add a log drain to a service such as
Axiom or Better Stack if you need long-term search. The startup `app.started`
line confirms that the log pipeline is working after a deploy.

Sentry is optional and off by default. Set `SENTRY_DSN` on the server and `VITE_SENTRY_DSN` at build time for the browser. Without a DSN both sides do nothing.

The server captures unexpected errors in `runAction`, the Nitro error hook, the presence socket, and the birthday scheduler. The browser captures route errors and unhandled errors. Data collection is disabled for user info, cookies, headers, bodies, query strings, and database values, and `beforeSend` removes any request or user fields that still appear. Errors include the same request id as the logs.

Set `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` to upload source maps during `pnpm build`. All three are required, otherwise the Vite plugin is skipped. `SENTRY_ENVIRONMENT` and `VITE_SENTRY_ENVIRONMENT` label events, and `VITE_RELEASE` sets the browser release.

Add an external uptime check on `/api/health`. It returns `503` when the database is unreachable.

## Analytics

Umami is optional and self-hosted. It is cookieless, and the app is configured so personal data does not reach it:

- Automatic pageviews are off (`data-auto-pageview="false"`). `src/components/app/AnalyticsPageviews.tsx` sends pageviews by hand through `trackPageview`, which reduces paths to a safe label. `/trees/<id>` becomes `/app`, `/invite/<token>` becomes `/invite`, and unknown paths are dropped.
- The document sets `data-exclude-search`, `data-exclude-hash`, `data-do-not-track`, `data-salt-rotation="daily"`, and `data-domains` from the public origin.
- `src/lib/analytics.ts` owns the full event list and payload allowlist. Adding an event requires a type entry, and unknown payload keys are dropped at runtime. Never add names, emails, file names, person ids, or tree ids.
- Never set `data-distinct-id` and never call `umami.identify()`.

Recommended Umami server settings for the self-hosted instance:

```text
SALT_ROTATION=day
ENABLE_CLIENT_SALT=1
DISABLE_TELEMETRY=1
PRIVATE_MODE=1
SKIP_LOCATION_HEADERS=1
TRUSTED_PROXIES=<your proxy CIDRs>
FORCE_SSL=1
```

Leave `GEO_DATABASE_URL` unset unless you actually need city-level location, and do not enable replays or heatmaps. Umami keeps data forever by default, so add a monthly prune to its database:

```sql
DELETE FROM website_event WHERE created_at < now() - interval '12 months';
DELETE FROM session WHERE created_at < now() - interval '12 months';
```

The privacy policy promises up to 12 months for analytics, so keep that job in place.

## Storage limits and abuse monitoring

Every account has a storage quota and a lifetime people quota. Defaults are 1 GiB and 500 people. Both live on `users` as `storage_quota_bytes` and `people_quota`, so you can raise one account without a deploy:

```sql
UPDATE users SET storage_quota_bytes = 10 * 1024 * 1024 * 1024 WHERE email = 'someone@example.com';
UPDATE users SET people_quota = 2000 WHERE email = 'someone@example.com';
```

How enforcement works:

1. `prepareUpload` reserves space inside a transaction protected by a per-account advisory lock. The reservation includes the declared original size plus the thumbnail, and the file row is inserted in the same transaction, so parallel prepares cannot both pass.
2. The presigned POST is capped at the declared size with `content-length-range`, so a client cannot under-declare an upload to slip past the quota.
3. `finalizeFile` stores the real original and thumbnail sizes. `users.people_created_count` increments inside a conditional `UPDATE`, so a create that would exceed the quota fails and the counter never decreases on delete.
4. Uploads count against the uploader across every tree. Files you uploaded into someone else's tree keep counting after you leave it.
5. A daily plugin removes `uploading` rows and objects older than 24 hours so abandoned prepares do not hold a reservation forever.

Account settings has a Storage and limits card showing bytes used, people created, the limits, and a `mailto:` link through `SUPPORT_EMAIL`.

Abuse signals live in `usage_events`, not in Umami. `pnpm abuse:report` prints per-account activity for the last 24 hours and 7 days: bytes uploaded, files uploaded, tree create/delete churn, quota rejections, rejected types, and rate-limit trips. The default warning thresholds are relative to the account quota (2x quota in 6 hours) plus absolute rules (1000 files, 20 tree create/delete cycles, 20 rejections). Set `ADMIN_ALERT_EMAIL` to receive the digest by email from the nightly job.

`usage_events` holds numbers and timestamps only: no file names, no email addresses, and no content. Rows cascade away with the account and are pruned after 90 days.

Run both reports from the repo:

```text
pnpm usage:report      storage used per account
pnpm abuse:report      uploads, churn, rejections, rate limits
```

Proposed paid tiers, the cost model, and how to map a plan to the two quota columns live in [docs/storage-plans.md](storage-plans.md). Keep pricing out of the app until a plan is actually for sale.

## Privacy and GDPR

The hosted instance targets family members in the EU, so the app is built around GDPR expectations. This is engineering documentation, not legal advice, and the published policy should get a legal review.

- `/privacy` is the controller-facing policy and `/terms` is the service agreement. Both are public, linked from the landing footer, the auth pages, account settings, and the registration form.
- The controller for the hosted instance is Samuele Zanca, contact `samuele+family-tree@zanca.dev`. Self-hosters are the controller for their own instance, and the policy says so.
- Tree content often describes living relatives who never created an account. The policy has a dedicated section for that, and account holders are responsible for having a lawful basis to add it.
- Rights are operable in the product: change email, download a zip with a JSON manifest and every original, and delete the account with password plus typed confirmation. Deletion blocks when the user is the last owner of a shared tree and removes trees where they are the only member.
- Tree deletion is guarded separately. Owners request it with the exact tree name. A tree with several owners needs every owner to approve. Once approved, the tree is locked for 30 days and any owner can restore it from `/trees`. The daily maintenance job then erases the storage prefix and the database rows. Account deletion still removes trees where the user is the only member immediately, because no account remains to restore them.
- An erasure request from a data subject is handled by the controller and is not blocked by the owner approval flow. `pnpm tree:purge -- <treeId> --yes [--force]` erases a tree immediately when that is required.
- Retention is enforced in code. The daily maintenance plugin prunes expired auth tokens, old invites, birthday email logs older than 12 months, `usage_events` older than 90 days, and trees whose 30 day deletion window has ended. Backup retention is 30 daily dumps plus one per month for 12 months.
- Data is hosted in the US. The policy discloses the location, the providers, and the safeguards used for EU data.

If you add a new data category, a new processor, or a new retention period, update `/privacy` in the same change.
