# Release checklist

Release checks for v0.1.0. Run these against a local copy before deploying. External infrastructure items stay unchecked until they are done in Railway and the monitoring service.

## Automated checks

- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`

## Migration dry run

- [x] Create an empty local database and apply every migration.

```sh
createdb -h 127.0.0.1 -p 5432 -U roots roots_migration_test
DATABASE_URL=postgres://roots@127.0.0.1:5432/roots_migration_test pnpm exec tsx scripts/migrate.ts
```

Result: 18 tables and 13 migration rows. Migrations apply cleanly from an empty database.

## Backup, verify, and restore

- [x] Run a backup against the local backup bucket.
- [x] Verify the latest dump checksum and archive listing.
- [x] Restore the latest dump and inspect relationship integrity.

```sh
pnpm backup
pnpm backup:verify
pnpm backup:restore --yes
pnpm db:check
```

Result: dump written and verified, restore completed, and `db:check` reported no relationship problems. Media sync reported two source objects and no failures.

## Two-tab realtime refresh

- [x] Open the same tree in two tabs.
- [x] Add a person in one tab.
- [x] Confirm the other tab updates without a reload.

Result: the second tab moved from 12 to 13 people after the first tab added a person. The test person and its activity row were removed afterward.

## Share privacy

- [x] Confirm a names-only link removes living dates, places, biographies, portraits, events, and media.
- [x] Confirm a guessed thumbnail URL for a living person returns 404.
- [x] Confirm full-detail links can serve image thumbnails.
- [x] Confirm revoked links show the unavailable page.
- [x] Confirm share responses send `X-Robots-Tag: noindex` and `Cache-Control: private, no-store`.

Result:

```text
share page: 200
living thumb (names only): 404
revoked page: This link is not active
cache-control: private, no-store
x-robots-tag: noindex, nofollow, noarchive
```

The temporary link was deleted afterward.

## Account deletion

- [x] Register a throwaway account.
- [x] Create a tree owned only by that account.
- [x] Delete the account with the password and typed email confirmation.
- [x] Confirm the session ends, the account is gone, and the sole-member tree is gone.

Result: redirect to the landing page, zero matching users, and zero matching trees.

## Export

- [x] Confirm the data-only and with-files export controls exist in account settings.
- [ ] Download both archives and inspect the manifest and media entries before the first production release.

## External infrastructure

These require dashboard or provider access and are not covered by local checks.

- [ ] Enable Railway Postgres point-in-time recovery.
- [ ] Create the Railway cron service from `railway.backup.json` after the branch is pushed.
- [ ] Add an external uptime monitor on `/api/health`.

## Test data cleanup

- [x] Remove throwaway people, activity rows, share links, and test accounts created during the release checks.
