# family-tree

A private, collaborative family tree built around an interactive graph of people, relationships, and the photographs and documents attached to them.

The graph is the main view. People are nodes, parent and partner relationships are edges, and media clusters behind the person who owns it. Each tree can have one owner and any number of editors and viewers, invited by link.

## Stack

- SolidStart 2 + SolidJS
- Drizzle ORM + PostgreSQL
- Railway Storage Bucket (S3-compatible) for originals and thumbnails
- `force-graph` for canvas rendering, pan and zoom
- Tailwind CSS v4
- shadcn-solid components on Kobalte for dialogs, menus, selects, tabs and toasts
- Zod for server input validation
- Vitest for unit tests

## Features in this version

- Email and password accounts with encrypted session cookies
- Email verification, password reset by email, and session invalidation on password changes
- Email address changes with a confirmation link to the new address and a notice to the old one
- Download a copy of your account, trees, and media as a zip, or delete your account with ownership safeguards
- Private family trees with owner, editor, and viewer roles
- Invites by copyable link or by email, with expiry and single use
- People, parent-child relationships, and partnerships
- Add a child with a second parent in one step, and keep the dialog open to add several children quickly
- Force-directed layout: parent and partner edges pull families into loose clusters, so relatives stay together and edges stay short
- Every parent set meets at a hidden family junction, so a couple and their children fan out from one point instead of crossing lines
- A label-aware collision force keeps names readable, and disconnected branches find their own space
- Media clusters around its owner through a short hidden spring and is drawn behind the graph, so a photo never covers a person
- Partner edges are dashed, parent arms follow the relationship type, and hovering a person dims everyone outside their immediate family
- Cycle-safe relationship analysis that stays bounded when relationships contradict each other, with an in-app warning and `pnpm db:check`
- "This is me" links a member to their person, so the tree opens around their own branch instead of the whole family
- Focus rings from immediate family out to first cousins, with a "Show more" chip and an Everyone option that reveals the rest of the tree in one click
- Search, neighbor highlighting, zoom and pan
- Calendar tab with birth and death anniversaries, plus upcoming birthdays for living relatives
- Subscribe to all tree birthdays from Google Calendar, Apple Calendar, or Outlook with a private iCal URL
- Email birthday reminders, with one-week, day-before, and day-of toggles in account settings
- Live presence: see who else has the tree open, which person, file, or album they are looking at, and a colored ring and name tag around that node
- Pointer cursor only over nodes, not links or empty canvas
- Person and document info panels on desktop and mobile
- Tree activity feed with filters, field-level changes, and an actor history
- Live refresh nudge when another member changes the tree
- Duplicate person warnings before adding a similar name or birth year
- Read-only `/demo` that runs the real tree workspace on sample data
- Public read-only share links with living-person privacy, optional thumbnails, expiry, and revocation
- Nightly PostgreSQL and media backups to a second private bucket, with checksum verification and a one-command restore
- Optional Sentry error tracking with PII scrubbing
- Optional Umami analytics with page views and product events, enabled by environment variables
- Privacy policy at `/privacy` and terms at `/terms`, linked from the app and the registration form
- Per-account storage and lifetime people limits, with a usage card in account settings
- Coarse abuse signals in Postgres with a `pnpm abuse:report` summary
- Full-screen image lightbox with a details sidebar
- Tag other people in a photo, with an "Also in photos" section on each tagged person's profile
- Optional date taken on photos, prefilled from EXIF and editable as a partial or approximate date
- Multi-file uploads become albums rendered as stacked nodes on the graph
- Portraits stay on the person node and are not duplicated as file nodes
- Person profiles with parents, partners, children, and life notes
- Partial and approximate dates for people, partnerships, and photos, including unknown-year birthdays
- A life events timeline for each person: residence, occupation, education, military service, migration, burial, and custom events
- Image, PDF, and document uploads attached to people
- Client-generated thumbnails, server-side content validation, and private file access
- Mobile layout with a person sheet, touch gestures, and a list-free graph fallback through search

## Local development

The repository includes a Nix shell with Node 24, pnpm, and PostgreSQL. Local S3 is provided by `s3rver` through npm, so no Docker is required.

```bash
nix-shell
pnpm install
cp .env.example .env
pnpm dev:services
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open <http://localhost:3000>.

The seed account is:

```text
demo@family-tree.local
family-tree-demo-12345
```

The dev server binds to `0.0.0.0`, so a phone on the same Tailscale network can open `http://<tailnet-host>:3000`.

### Dev services

```bash
pnpm dev:services   # start Postgres on 5432 and local S3 on 9000
pnpm dev:status
pnpm dev:stop
pnpm dev:reset-db   # delete and re-create the disposable local Postgres cluster
```

Postgres data lives in `.dev/postgres`. Local objects live in `.dev/s3`. Both are ignored by git.

If you do not use Nix, any PostgreSQL 18+ database and S3-compatible service will work. Point `DATABASE_URL`, `S3_ENDPOINT`, and the other `S3_*` variables at them.

### Never develop against production

Production data is read-only from a development machine. Do not point `DATABASE_URL` at Railway or any other remote host, and do not run feature work, seeds, or migrations there.

Copy production Postgres into the local cluster instead:

```bash
pnpm dev:services
pnpm db:pull
pnpm dev
```

`pnpm db:pull` dumps the linked Railway `Postgres` service over SSH, restores it into the local database, and applies any newer migrations from your branch. Set `RAILWAY_DB_SERVICE` if the database service has another name.

`pnpm dev` and `pnpm db:seed` refuse to start when `DATABASE_URL` is not a loopback host. `pnpm db:migrate` applies the same rule but allows the Railway pre-deploy environment. Override only when you know what you are doing with `ALLOW_REMOTE_DB=1`.

Check the copied data for contradictory family links:

```bash
pnpm db:check
```

It reports parent loops, partners who are also ancestors, and people with more than two parents.

### Environment

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

## How media works

1. The browser creates a small WebP or JPEG thumbnail with canvas.
2. The server returns presigned POST fields for the original and the thumbnail.
3. The browser uploads both directly to the bucket.
4. The server checks the object size, declared type, and magic bytes, then marks the file ready.
5. Thumbnails are served through `/api/files/:id/thumb` with a membership check and private cache headers.
6. Originals and documents redirect to a short-lived presigned URL after an authorization check.

The bucket stays private. Browsers never receive storage credentials. SVG, HTML, JavaScript, and executable files are rejected.

### Photo tags and dates

Every file is still filed under one person, which is where its graph node lives. Editors can additionally tag any other people who appear in an image. Tags live in `file_tags` with tree-scoped foreign keys, so removing a person or a file removes the tags automatically. A tagged person sees the picture under "Also in photos" on their profile without becoming the owner.

Images also carry an optional `taken_at` date. The browser reads EXIF `DateTimeOriginal` with `exifr` during upload and uses it as the initial value; editors can change or clear it in the file panel or lightbox. This is separate from the upload date, so scanned photos can be dated to when they were actually taken, and the date can be partial or approximate.

`file_tags` also has nullable `face_box` and a `source` of `manual` or `face`. Nothing writes `face` yet: the columns and the tag picker are the groundwork for face detection and a "who is this?" pass after upload.

## How dates work

Date fields are stored as a small JSON value rather than a SQL `date`, so partial and approximate dates survive:

- A qualifier: `exact`, `about`, `before`, `after`, `between`, or `unknown`.
- A start date with an optional year, month, and day.
- An optional end date for a range.
- A birthday with a known month and day but no known year.

`src/lib/fuzzy-date.ts` parses, formats, validates, and sorts these values. The editor has a type selector plus optional year, month, and day inputs; choosing "between" adds the end date. The graph, profile header, search results, and file panel show labels such as `c. 1920`, `before 1900`, `1890-1900`, and `Born 1920 - 1987`.

Birthday emails and iCal subscriptions only include dates with a known month and day. An unknown year still produces a birthday, but the age is omitted. Approximate dates with a day are treated as birthdays; open-ended ranges are not.

The same model is used for `people.birth_date`, `people.death_date`, `partnerships.start_date`, `partnerships.end_date`, `files.taken_at`, and `person_events.date`. Existing `date` columns were converted in migration `0007_gray_sumo.sql`, which backfills every value as an exact date.

## Life events

Each person has a timeline of life events. An event has a kind (residence, occupation, education, military service, immigration, emigration, burial, or other), an optional title, a place, a fuzzy date, and notes. Editors can add, edit, and delete events from the person panel. Events are included in account exports and are removed with the person or tree.

## Tree activity

Every meaningful change writes a row to `tree_activity` with an actor name snapshot, an action, the affected person when there is one, a human summary, and field-level before and after values for person and event edits. The activity page is at `/trees/:treeId/activity` and is visible to every member. It supports filtering by person, member, and type, with cursor pagination.

The actor name is snapshotted. Deleting an account replaces the actor with "Former member" instead of erasing the history. Rows are deleted with the tree.

## Live refresh

The presence WebSocket also carries a `tree-changed` message. Mutations call `notifyTreeChanged`, the WebSocket route forwards it to sockets in that tree, and open tabs revalidate the graph after a short debounce. Tabs also refresh on focus, visibility change, and reconnect. If a dialog is open, the refresh waits until it closes and a toast explains why.

## Duplicate people

Before creating a person, the app compares normalized names, maiden names, nicknames, and birth year ranges. A likely duplicate shows a warning with the matching reasons. The add-relative flow can switch to the existing person, and "Add anyway" records an explicit override. `pnpm db:check` prints likely duplicate pairs.

## Demo and share links

`/demo` runs the real tree workspace on the static sample data from `src/components/landing/demo-tree.ts`. It has no account, no presence, and no write actions, and it shows a banner that links to registration.

Tree owners can create public read-only links from the Sharing tab in tree settings. Each link stores only a SHA-256 hash of its token, so the URL is shown once at creation. A link can have a label, an expiry from one day to ninety days or no expiry, and can be revoked immediately. Revoked, expired, or unknown tokens show a simple unavailable page.

Living people are anyone without a recorded death date. The default share setting is names only: names and relationships, with dates, places, biographies, portraits, events, and media removed. Owners can instead hide living people entirely or show full details. When media is enabled, only image thumbnails are served, never original files or documents, and a thumbnail request for a living person is rejected unless the link allows full details. Share responses send `X-Robots-Tag: noindex` and `Cache-Control: private, no-store`.

## How presence works

1. The browser opens `wss://<host>/presence?treeId=...` with `@solid-primitives/websocket`, which buffers the first focus message and reconnects with a fixed delay after deploys, sleeps, and network drops.
2. Nitro's WebSocket route in `server/routes/presence.ts` unseals the same `family_tree_session` cookie SolidStart uses and checks tree membership before the upgrade completes. Because the session is a sealed cookie with no server-side state, reconnects survive deploys.
3. Each socket joins a namespace per tree and a presence topic. The client sends `{ type: "focus", nodeId }` when the open person, file, or album changes; the server broadcasts a full snapshot of who is present and what each peer has open.
4. The avatar stack dedupes by user, and each avatar is outlined in that person's presence color. The graph draws one ring per connected tab plus a name tag in the same color. Colors come from a matte palette keyed by user id, so renaming a person does not change their color.

Presence is ephemeral. Nothing is written to Postgres, and a closed tab removes the peer immediately. State lives in the app process, which matches a single Railway replica.

## How birthday emails work

Account settings has three independent reminders: one week before, the day before, and on the morning of a birthday. They are off, off, and on by default. Preferences are per user and cover every tree that user belongs to.

1. A Nitro plugin checks once an hour and runs the job after `BIRTHDAY_EMAIL_HOUR_UTC` (08:00 by default) on the UTC calendar date.
2. The job collects verified users with at least one reminder enabled and living people with birth dates from all their trees.
3. Each enabled reminder becomes one digest email per user, so a person with several birthdays on the same day receives a single message.
4. `birthday_email_log` claims each user, reminder kind, and date before sending. Restarts, repeated hourly checks, and duplicate replicas cannot send the same reminder twice.
5. February 29 birthdays are treated as February 28 in common years.

Set `BIRTHDAY_EMAILS=off` to disable the scheduler, or `BIRTHDAY_EMAILS=on` to run it in development and print emails to the server console when Resend is not configured. `BIRTHDAY_EMAIL_HOUR_UTC` changes the daily send hour.

## How calendar subscriptions work

Account settings has a Calendar subscription card. It creates one private iCal URL per user that covers every tree that user belongs to.

1. The URL contains a feed id and an HMAC signature made with `SESSION_SECRET`. No token is stored in the database.
2. The endpoint checks the signature and then joins current tree memberships, so leaving a tree removes its people on the next fetch.
3. Each person with a birth date becomes one recurring all-day event. February 29 birthdays use a recurrence rule that falls on February 28 in common years.
4. Creating a new link revokes the old feed and issues a new id. Turning the feed off revokes it immediately.
5. Rotating `SESSION_SECRET` invalidates every existing subscription URL, along with sessions.

The link is a bearer secret: anyone who has it can read names and birthdays from that user's trees. Treat it like a password. Calendar apps refresh subscribed feeds on their own schedule, so edits are not instant.

## Privacy and GDPR

The hosted instance targets family members in the EU, so the app is built around GDPR expectations. This is engineering documentation, not legal advice, and the published policy should get a legal review.

- `/privacy` is the controller-facing policy and `/terms` is the service agreement. Both are public, linked from the landing footer, the auth pages, account settings, and the registration form.
- The controller for the hosted instance is Samuele Zanca, contact `samuele+family-tree@zanca.dev`. Self-hosters are the controller for their own instance, and the policy says so.
- Tree content often describes living relatives who never created an account. The policy has a dedicated section for that, and account holders are responsible for having a lawful basis to add it.
- Rights are operable in the product: change email, download a zip with a JSON manifest and every original, and delete the account with password plus typed confirmation. Deletion blocks when the user is the last owner of a shared tree and removes trees where they are the only member.
- Retention is enforced in code. The daily maintenance plugin prunes expired auth tokens, old invites, birthday email logs older than 12 months, and `usage_events` older than 90 days. Backup retention is 30 daily dumps plus one per month for 12 months.
- Data is hosted in the US. The policy discloses the location, the providers, and the safeguards used for EU data.

If you add a new data category, a new processor, or a new retention period, update `/privacy` in the same change.

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

Proposed paid tiers, the cost model, and how to map a plan to the two quota columns live in `docs/storage-plans.md`. Keep pricing out of the app until a plan is actually for sale.

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
`error`; production defaults to `info`. See [docs/logging.md](docs/logging.md)
for the event catalog, privacy rules, and the support workflow.

Railway runtime logs are short-lived. Add a log drain to a service such as
Axiom or Better Stack if you need long-term search. The startup `app.started`
line confirms that the log pipeline is working after a deploy.

Sentry is optional and off by default. Set `SENTRY_DSN` on the server and `VITE_SENTRY_DSN` at build time for the browser. Without a DSN both sides do nothing.

The server captures unexpected errors in `runAction`, the Nitro error hook, the presence socket, and the birthday scheduler. The browser captures route errors and unhandled errors. Data collection is disabled for user info, cookies, headers, bodies, query strings, and database values, and `beforeSend` removes any request or user fields that still appear. Errors include the same request id as the logs.

Set `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` to upload source maps during `pnpm build`. All three are required, otherwise the Vite plugin is skipped. `SENTRY_ENVIRONMENT` and `VITE_SENTRY_ENVIRONMENT` label events, and `VITE_RELEASE` sets the browser release.

Add an external uptime check on `/api/health`. It returns `503` when the database is unreachable.

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

## Scripts

```text
pnpm dev            start Vite with host 0.0.0.0
pnpm build          production build
pnpm start          run the production server
pnpm typecheck      TypeScript check
pnpm test           Vitest unit tests
pnpm db:generate    generate a Drizzle migration
pnpm db:migrate     apply migrations
pnpm db:seed        seed the demo tree
pnpm db:pull        copy the linked Railway Postgres into the local database
pnpm db:check       report contradictory parent and partner relationships
pnpm usage:report   show storage, quota, and people counts per account
pnpm abuse:report   show upload, churn, rejection, and rate limit signals
pnpm maintenance:run prune stale uploads, tokens, invites, and old events
pnpm storage:cors   set bucket CORS from APP_URL and CORS_ORIGINS
pnpm backup         dump PostgreSQL and sync media to the backup bucket
pnpm backup:verify  check the latest dump checksum and archive
pnpm backup:restore restore a dump into a local scratch database
pnpm dev:services   start local Postgres and S3
pnpm dev:reset-db   delete and re-create the local Postgres cluster
```

UI checks are done manually with the agent-browser tool against the local or production app. The project does not include a browser test runner.

## Project layout

```text
drizzle/            schema and SQL migrations
scripts/            migration, seed, storage, dev-service scripts
src/api/            server functions and query wrappers
src/components/     graph, people, files, trees, UI primitives
src/lib/            pure client helpers: graph model, focus distances, thumbnails, uploads, formatting, presence socket
src/routes/         file-based routes and API handlers
src/server/         auth, guards, storage, file service, config, presence state
server/routes/      Nitro server routes for WebSocket endpoints (not SolidStart routes)
```

The WebSocket endpoint lives in `server/` because SolidStart's `src/routes` only handles `GET`/`POST` handlers. `vite.config.ts` points Nitro at `./server` and enables `features.websocket`.

### UI conventions

The interface uses [shadcn-solid](https://shadcn-solid.com) components on top of Kobalte, kept in `src/components/ui`. Tailwind theme tokens live in `src/app.css` and carry the paper, moss and gold palette: use `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `bg-accent`, `text-destructive` and `text-gold` rather than raw hex values.

- Add a component with `pnpm dlx shadcn-solid@latest add <name>` (configured by `components.json`), then edit it in place like any other source file.
- `~/components/ui/button.tsx` holds the shared button variants, `icon-button.tsx` wraps icon-only buttons with a tooltip, and `~/lib/utils.ts` exports `cva`/`cx` with `tailwind-merge` applied.
- `Modal`, `ConfirmDialog`, `Field`, `Toast` and `Loading` are thin adapters over the generated primitives, so app code does not need to change when a primitive is restyled.
- Dark mode is the `.dark` class on `<html>`, set by `ThemeProvider`, and is wired into Tailwind through `@custom-variant dark` in `src/app.css`.
- The graph canvas draws with its own hardcoded colours in `src/components/graph/GraphView.tsx`; theme tokens do not affect it.

## Your data

Account settings has three exits for your own data:

- **Change email.** A confirmation link goes to the new address and a notice goes to the old one. The old address keeps working until the new one confirms. Pending changes can be cancelled from account settings.
- **Download your data.** `GET /api/account/export` streams a zip with `family-tree-export.json` and a README. The manifest covers your profile, memberships, trees, people, relationships, groups, tags, life events, and file metadata. Add `?media=1` to include every original photo and document, or `?format=json` to download the manifest alone. Exports are rate limited to three per hour per account.
- **Delete account.** This requires your password and a typed email confirmation. Trees where you are the only member are deleted with their storage objects. If you are the last owner of a shared tree, promote another owner or delete that tree first. Deleting your account clears the session and cascades memberships, calendar feeds, birthday logs, auth tokens, and pending email changes.

Account settings also shows storage and people usage against your limits, with a link to ask for more. The published policy is at `/privacy` and the terms are at `/terms`. See [Privacy and GDPR](#privacy-and-gdpr) for the engineering side.

## Focused browsing

Every member can mark the person they represent with "This is me" on a profile. The graph then opens with distance rings around that person instead of the whole family:

- 1 hop: partner, parents and children
- 2 hops: siblings, grandparents, grandchildren and in-laws
- 3 hops: aunts, uncles, nieces, nephews and great-grandparents
- 4 hops: first cousins, great-aunts and great-uncles

The default is 4 for trees of 25 people or more, and Everyone below that. The Show more chip adds the next ring, Everyone reveals the whole tree, and the focus menu switches bands or changes who you are. Partners of visible people come along with them, so a spouse is never cut off one hop away. Unconnected people are always shown, and the chosen band is remembered per tree in the browser.

Selecting a search result or opening a deep link outside the focus reveals the shortest chain of relationships to that person, so they arrive in context without expanding every branch. Owners can unlink a member from the Members tab in tree settings.

This is a reading aid, not access control. The whole graph is still sent to every member.

## Known limitations

- No realtime co-editing. The graph refreshes after changes and a live nudge refreshes other open tabs, but edits are not merged character by character.
- Duplicate detection is heuristic. There is no merge tool yet, so "Add anyway" can still create a duplicate.
- Share links cover a whole tree. There is no per-person sharing or comment access yet.
- Presence is held in the app process. It works as-is on a single Railway replica. Running more than one replica needs a shared presence store, such as Redis or Postgres `LISTEN`/`NOTIFY`.
- HEIC photos work only when the browser can decode them; otherwise the user is asked to export as JPEG.
- Backups live in a second Railway bucket in the same region and are not encrypted by the app. Backups run daily, so enable PostgreSQL point-in-time recovery for the gap between dumps.
- Dates are Gregorian and structured. Seasons and free-text dates such as "spring 1918" are not represented; use an event note for those.
- Focus is a presentation aid, not access control. The whole tree is still loaded for every member, and anyone can reveal all branches with one click.
- No GEDCOM import or export, printable chart export, OCR, or face detection yet. See [docs/roadmap.md](docs/roadmap.md) for the deferred work.

## Roadmap

GEDCOM import and export, printable charts, OCR, face detection, multi-replica presence, and a person merge flow are deferred beyond v0.1.0. See [docs/roadmap.md](docs/roadmap.md) for scope and open questions. Pre-release checks and their current status live in [docs/release-checklist.md](docs/release-checklist.md).

## License

[MIT](LICENSE)
