# Development

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

If you do not use Nix, any PostgreSQL 18+ database and S3-compatible service will work. Point `DATABASE_URL`, `S3_ENDPOINT`, and the other `S3_*` variables at them. See [Environment variables](operations.md#environment).

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

## UI conventions

The interface uses [shadcn-solid](https://shadcn-solid.com) components on top of Kobalte, kept in `src/components/ui`. Tailwind theme tokens live in `src/app.css` and carry the paper, moss and gold palette: use `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `bg-accent`, `text-destructive` and `text-gold` rather than raw hex values.

- Add a component with `pnpm dlx shadcn-solid@latest add <name>` (configured by `components.json`), then edit it in place like any other source file.
- `~/components/ui/button.tsx` holds the shared button variants, `icon-button.tsx` wraps icon-only buttons with a tooltip, and `~/lib/utils.ts` exports `cva`/`cx` with `tailwind-merge` applied.
- `Modal`, `ConfirmDialog`, `Field`, `Toast` and `Loading` are thin adapters over the generated primitives, so app code does not need to change when a primitive is restyled.
- Dark mode is the `.dark` class on `<html>`, set by `ThemeProvider`, and is wired into Tailwind through `@custom-variant dark` in `src/app.css`.
- The graph canvas draws with its own hardcoded colours in `src/components/graph/GraphView.tsx`; theme tokens do not affect it.
