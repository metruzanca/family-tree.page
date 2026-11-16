# family-tree

A private, collaborative family tree built around an interactive graph of people, relationships, and the photographs and documents attached to them.

The graph is the main view. People are nodes, parent and partner relationships are edges, and media appears as small satellite nodes. Each tree can have one owner and any number of editors and viewers, invited by link.

## Stack

- SolidStart 2 + SolidJS
- Drizzle ORM + PostgreSQL
- Railway Storage Bucket (S3-compatible) for originals and thumbnails
- `force-graph` + `d3-force` for the canvas graph
- Tailwind CSS v4
- shadcn-solid components on Kobalte for dialogs, menus, selects, tabs and toasts
- Zod for server input validation
- Vitest for unit tests

## Features in this version

- Email and password accounts with encrypted session cookies
- Email verification, password reset by email, and session invalidation on password changes
- Private family trees with owner, editor, and viewer roles
- Invites by copyable link or by email, with expiry and single use
- People, parent-child relationships, and partnerships
- Add a child with a second parent in one step, and keep the dialog open to add several children quickly
- Generation-aware force graph with a freeform layout toggle
- Cycle-safe generation rows that stay bounded when relationships contradict each other, with an in-app warning and `pnpm db:check`
- Static generation bands: parents and children stay in ordered rows, with no node dragging
- Partners are aligned on the same row and placed side by side
- Parent pairs join at one small junction before branching to their children, so each child gets one parent-line arrow
- Direction flip for oldest-at-top or oldest-at-bottom layouts
- Disconnected groups inside a tree get their own side-by-side space, so a new unconnected person never overlaps the rest of the tree
- Search, neighbor highlighting, zoom and pan
- Calendar tab with birth and death anniversaries, plus upcoming birthdays for living relatives
- Email birthday reminders, with one-week, day-before, and day-of toggles in account settings
- Live presence: see who else has the tree open, which person, file, or album they are looking at, and a colored ring and name tag around that node
- Pointer cursor only over nodes, not links or empty canvas
- Person and document info panels on desktop and mobile
- Optional Umami analytics with page views and product events, enabled by environment variables
- Full-screen image lightbox with a details sidebar
- Multi-file uploads become albums rendered as stacked nodes on the graph
- Portraits stay on the person node and are not duplicated as file nodes
- Person profiles with parents, partners, children, and life notes
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
| `UMAMI_SCRIPT_URL` | Optional Umami script URL, for example `https://analytics.example.com/script.js` |
| `UMAMI_WEBSITE_ID` | Optional Umami website ID that pairs with the script URL |

`UMAMI_SCRIPT_URL` and `UMAMI_WEBSITE_ID` are both optional. Set both to inject the Umami script into the document; leave either blank to disable analytics. Product events are sent through `src/lib/analytics.ts` and silently no-op when the script is absent.

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

## Railway deployment

Create a Railway project with:

- One app service from this repository
- One PostgreSQL service
- One Storage Bucket

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
UMAMI_SCRIPT_URL=<optional Umami script URL>
UMAMI_WEBSITE_ID=<optional Umami website ID>
```

`railway.json` configures the build, start command, health check, and the `pnpm db:migrate` pre-deploy command.

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
pnpm storage:cors   set bucket CORS from APP_URL and CORS_ORIGINS
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
src/lib/            pure client helpers: graph model, thumbnails, uploads, formatting, presence socket
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

## Known limitations

- Email addresses cannot be changed yet.
- No realtime co-editing. Presence is live, but the graph still refreshes after changes.
- Presence is held in the app process. It works as-is on a single Railway replica. Running more than one replica needs a shared presence store, such as Redis or Postgres `LISTEN`/`NOTIFY`.
- HEIC photos work only when the browser can decode them; otherwise the user is asked to export as JPEG.
- Railway buckets do not have automatic backups. PostgreSQL point-in-time recovery should be enabled on the database.
- No GEDCOM import/export, public share links, OCR, or face tagging yet.

## License

[MIT](LICENSE)
