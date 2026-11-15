# Roots

A private, collaborative family tree built around an interactive graph of people, relationships, and the photographs and documents attached to them.

The graph is the main view. People are nodes, parent and partner relationships are edges, and media appears as small satellite nodes. Each tree can have one owner and any number of editors and viewers, invited by link.

## Stack

- SolidStart 2 + SolidJS
- Drizzle ORM + PostgreSQL
- Railway Storage Bucket (S3-compatible) for originals and thumbnails
- `force-graph` + `d3-force` for the canvas graph
- Tailwind CSS v4
- Zod for server input validation
- Vitest for unit tests, Playwright for browser tests

## Features in this version

- Email and password accounts with encrypted session cookies
- Private family trees with owner, editor, and viewer roles
- Link-based invites with expiry and single use
- People, parent-child relationships, and partnerships
- Generation-aware force graph with a freeform layout toggle
- Soft generation bands: drag any node, and it settles back into its level with leeway
- Direction flip for oldest-at-top or oldest-at-bottom layouts
- Search, neighbor highlighting, node dragging, zoom and pan
- Pointer cursor only over nodes, not links or empty canvas
- Person and file info panels on desktop and mobile
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
| `APP_URL` | Public origin, used for invite links and CORS |
| `S3_ENDPOINT` | S3 API endpoint |
| `S3_REGION` | Bucket region |
| `S3_BUCKET` | Bucket name |
| `S3_ACCESS_KEY_ID` | Bucket access key |
| `S3_SECRET_ACCESS_KEY` | Bucket secret |
| `S3_FORCE_PATH_STYLE` | `true` for local s3rver, `false` for Railway buckets |

`CORS_ORIGINS` can hold extra comma-separated origins for `pnpm storage:cors`.

## How media works

1. The browser creates a small WebP or JPEG thumbnail with canvas.
2. The server returns presigned POST fields for the original and the thumbnail.
3. The browser uploads both directly to the bucket.
4. The server checks the object size, declared type, and magic bytes, then marks the file ready.
5. Thumbnails are served through `/api/files/:id/thumb` with a membership check and private cache headers.
6. Originals and documents redirect to a short-lived presigned URL after an authorization check.

The bucket stays private. Browsers never receive storage credentials. SVG, HTML, JavaScript, and executable files are rejected.

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
pnpm e2e            Playwright browser tests
pnpm db:generate    generate a Drizzle migration
pnpm db:migrate     apply migrations
pnpm db:seed        seed the demo tree
pnpm storage:cors   set bucket CORS from APP_URL and CORS_ORIGINS
pnpm dev:services   start local Postgres and S3
```

The Playwright test needs the dev server and local services running. On NixOS, point Playwright at an installed Chromium or Brave binary:

```bash
PLAYWRIGHT_BROWSER_PATH=/path/to/chrome pnpm e2e
```

## Project layout

```text
drizzle/            schema and SQL migrations
scripts/            migration, seed, storage, dev-service scripts
src/api/            server functions and query wrappers
src/components/     graph, people, files, trees, UI primitives
src/lib/            pure client helpers: graph model, thumbnails, uploads, formatting
src/routes/         file-based routes and API handlers
src/server/         auth, guards, storage, file service, config
```

## Known limitations

- No email verification, password reset, or email invites yet. Invite links are shared manually.
- No realtime co-editing. The graph refreshes after changes.
- HEIC photos work only when the browser can decode them; otherwise the user is asked to export as JPEG.
- Railway buckets do not have automatic backups. PostgreSQL point-in-time recovery should be enabled on the database.
- No GEDCOM import/export, public share links, OCR, or face tagging yet.

## License

Private project.
