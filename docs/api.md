# Developer API

Every tree can issue read-only bearer tokens from tree settings, under **Sharing**. A token is bound to one tree, stored only as a SHA-256 hash, and shown once. It reads the whole tree, including living relatives, so only an owner can create one. Tokens can expire and can be revoked immediately; leaving a tree disables its token on the next request.

The API lives under `/api/v1`:

- `GET /me` describes the token, its scopes, and its tree.
- `GET /trees` and `GET /trees/:treeId` return tree metadata and counts.
- `GET /trees/:treeId/people` accepts `q`, `surname`, `limit`, and `cursor`.
- `GET /trees/:treeId/people/:personId` returns the person, immediate family, partners, events, and media. A shared marriage or divorce appears on both participants, and events carry `partnerPersonId` when one is recorded.
- `GET /trees/:treeId/relationships`, `/events`, `/search`, and `/changes` cover the rest of the tree.
- `GET /trees/:treeId/export.json` returns a complete snapshot. Media is referenced by URL, not embedded.
- `GET /trees/:treeId/gedcom` returns GEDCOM 5.5.1, or 7 with `?version=7`, for other genealogy tools.
- `GET /trees/:treeId/media/:fileId/thumb` and `/download` serve binaries with the same token.

Lists use an opaque cursor over `(updatedAt, id)`. Tree metadata, relationships, and exports support `ETag` with `If-None-Match`. Requests are limited to 120 per minute per token and exports to 10 per hour. The limiter is in-process, matching the single-replica presence design.

The contract is `openapi/roots-v1.json`, served at `/api/v1/openapi.json` and rendered at `/docs/api`. `pnpm openapi:check` runs Redocly lint and validates every documented example; the contract test in `src/server/api/contract.test.ts` validates real DTO output against the schemas. CI runs both, so a handler change cannot drift from the published contract.

The changes feed is derived from the human activity log. It reports creates, updates, deletes, and restores, but it is not a byte-level diff; clients that need a consistent snapshot should fetch the export. Browser clients on another origin need that origin added to `API_ALLOWED_ORIGINS`.

## Related

- [GEDCOM](gedcom.md)
- [Research guide](research.md)
- [OpenAPI contract](../openapi/roots-v1.json)
