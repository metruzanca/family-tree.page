# Roots

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
- Generation-aware force graph with a freeform layout toggle
- Static generation bands: parents and children stay in ordered rows, with no node dragging
- Partners are aligned on the same row and placed side by side
- Parent pairs join at one small junction before branching to their children, so each child gets one parent-line arrow
- Direction flip for oldest-at-top or oldest-at-bottom layouts
- Search, neighbor highlighting, zoom and pan
- Live presence: see who else has the tree open, which person, file, or album they are looking at, and a colored ring around that node
- Pointer cursor only over nodes, not links or empty canvas
- Person and document info panels on desktop and mobile
- Production Umami analytics with page views and product events
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
demo@roots.local
roots-demo-12345
```

The dev server binds to `0.0.0.0`, so a phone on the same Tailscale network can open `http://<tailnet-host>:3000`.

### Dev services

```bash
pnpm dev:services   # start Postgres on 5432 and local S3 on 9000
pnpm dev:status
pnpm dev:stop
```

Postgres data lives in `.dev/postgres`. Local objects live in `.dev/s3`. Both are ignored by git.

If you do not use Nix, any PostgreSQL 16+ database and S3-compatible service will work. Point `DATABASE_URL`, `S3_ENDPOINT`, and the other `S3_*` variables at them.

### Environment

Copy `.env.example` to `.env`. The important variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | 32+ random characters used to encrypt session cookies |
| `APP_URL` | Public origin fallback for email links and CORS when `RAILWAY_PUBLIC_DOMAIN` is unset |
| `RESEND_API_KEY` | Resend API key used for verification, reset, and invitation emails |
| `RESEND_FROM_EMAIL` | Sender identity, for example `Roots <hello@your-domain.tld>` |
| `S3_ENDPOINT` | S3 API endpoint |
| `S3_REGION` | Bucket region |
| `S3_BUCKET` | Bucket name |
| `S3_ACCESS_KEY_ID` | Bucket access key |
| `S3_SECRET_ACCESS_KEY` | Bucket secret |
| `S3_FORCE_PATH_STYLE` | `true` for local s3rver, `false` for Railway buckets |

`CORS_ORIGINS` can hold extra comma-separated origins for `pnpm storage:cors`.

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` are optional in development. Without a key, verification, reset, and invitation emails are printed to the server console instead of being sent, so the flows still work locally. In production the sender domain must be verified in Resend first.

On Railway, email links and invite links use `RAILWAY_PUBLIC_DOMAIN` (the assigned public domain, custom domains included) before falling back to `APP_URL`. `pnpm storage:cors` also includes that domain automatically when the variable is present.

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
2. Nitro's WebSocket route in `server/routes/presence.ts` unseals the same `roots_session` cookie SolidStart uses and checks tree membership before the upgrade completes. Because the session is a sealed cookie with no server-side state, reconnects survive deploys.
3. Each socket joins a namespace per tree and a presence topic. The client sends `{ type: "focus", nodeId }` when the open person, file, or album changes; the server broadcasts a full snapshot of who is present and what each peer has open.
4. The avatar stack dedupes by user, while the graph draws one ring per connected tab, colored from the same palette as that person's initials avatar.

Presence is ephemeral. Nothing is written to Postgres, and a closed tab removes the peer immediately. State lives in the app process, which matches a single Railway replica.

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
RESEND_FROM_EMAIL=Roots <hello@your-domain.tld>
S3_ENDPOINT=${{BucketName.ENDPOINT}}
S3_REGION=${{BucketName.REGION}}
S3_BUCKET=${{BucketName.BUCKET}}
S3_ACCESS_KEY_ID=${{BucketName.ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{BucketName.SECRET_ACCESS_KEY}}
S3_FORCE_PATH_STYLE=false
```

`railway.json` configures the build, start command, health check, and the `pnpm db:migrate` pre-deploy command.

After the first domain is assigned, apply bucket CORS:

```bash
APP_URL=https://your-domain.tld pnpm storage:cors
```

For local development against the same bucket, add localhost origins through `CORS_ORIGINS`.

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
pnpm storage:cors   set bucket CORS from APP_URL and CORS_ORIGINS
pnpm dev:services   start local Postgres and S3
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

Private project.
