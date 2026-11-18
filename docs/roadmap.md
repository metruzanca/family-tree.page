# Roadmap

Deferred work beyond v0.1.0. None of this is shipped yet. The order is a suggestion, not a commitment.

## 1. GEDCOM import

GEDCOM 5.5.1 export is shipped: names, dates, places, life events, notes, media references, families, and `_ROOTS_ID` for round trips. Import is the remaining half, and it is where data quality is won or lost.

Scope:

- Parse GEDCOM 5.5.1 first, with GEDCOM 7 as a follow-up.
- Preview every import with a per-record report, and never merge silently.
- On conflict, offer keep, replace, or merge per person, and reuse the duplicate detector as the review step.
- Map GEDCOM date approximations back to fuzzy dates without losing qualifiers.
- Map `FAM` records to partnerships and parent-child links. Sex is recorded now, so use it for `HUSB` and `WIFE` where possible and flag same-sex or unknown couples for review.
- Keep the operation resumable, because large files can exceed a single request.
- Decide whether media is matched by file name, embedded, or skipped.

Open questions:

- How to represent same-sex couples, since GEDCOM 5.5.1 has only `HUSB` and `WIFE`.
- How to map custom life events to the standard event tags and back.
- Whether an import creates a new tree or merges into an existing one.

## 2. Printable charts and tree posters

The graph is currently a screen-first layout. A printable poster needs a different renderer with paper sizes, page breaks, a legend, and a title block.

Scope:

- SVG or PDF output with a chosen generation direction.
- Poster presets such as A3, A2, and 24 by 36 inches.
- A focus choice: the whole tree or one person's branch.
- Optional living-person redaction that mirrors share links.
- Download from tree settings, generated on demand rather than stored.

Dependency: the graph layout should settle before a poster format is locked in.

## 3. OCR for documents

Scanned letters, certificates, and newspaper clippings are common uploads. OCR would make them searchable and suggest dates and names.

Scope:

- Run text extraction in a background job after upload.
- Store extracted text beside the file, not in the original document.
- Search file text from the tree search.
- Offer suggested names and dates for an editor to accept, never apply them automatically.
- Keep a per-tree toggle so families can opt out.

## 4. Face naming suggestions

Face detection is live: the browser finds faces, editors link them to people, and only boxes are stored. Recognition is the deferred half, and it needs care because a face template is sensitive data.

Scope:

- Cluster faces inside one tree using an embedding computed on the device, and store the vector only if the family opts in.
- Suggest a name for a new face when a cluster already has a confident label.
- Never auto-tag a living person; ask an owner to confirm, and let members reject suggestions.
- Let editors merge or split clusters.
- Bulk-scan existing albums with progress, cancellation, and a per-tree opt-out.
- Optional portrait crops derived from a face box.

## 5. Multi-replica presence

Presence is held in the app process, so the app currently runs as one replica. Horizontal scaling needs a shared presence store.

Scope:

- Move presence and the tree-change bus to Redis or Postgres `LISTEN`/`NOTIFY`.
- Keep the existing WebSocket protocol and reconnect behavior.
- Add a sticky-session or shared-store decision for the socket upgrade.
- Load-test with two replicas and a browser tab connected to each.

## 6. Person merge tool

Duplicate detection warns before creating a person, but there is no merge flow.

Scope:

- Compare two people side by side, including relationships, events, files, and tags.
- Choose the surviving values per field.
- Reparent relationships without creating cycles.
- Move media and tags, then delete the losing row.
- Write one activity entry that explains the merge.

## 7. Research desk follow-ups

The text views shipped first because they work over the existing records. The evidence layer is what turns them into defensible research.

Scope:

- Sources and citations: source, repository, citation detail, page or film number, URL, accessed date, and quality. Attach a citation to a specific fact, not just a person.
- Fact confidence: certain, probable, possible, disputed, plus a proof note.
- Name variants: birth, married, religious, and also-known-as names with GEDCOM `NAME` type mapping.
- Research tasks and notes per person or branch, so open questions are visible to collaborators.
- Place authority: canonical place plus hierarchy, with a merge step for variants.
- Saved searches, a "changed since" digest, and comments on a person.

## 8. API follow-ups

Shipped: read-only `/api/v1` endpoints, tree-scoped hashed tokens with scopes and expiry, cursor pagination, ETags, JSON export, media downloads, the OpenAPI 3.1 contract at `/api/v1/openapi.json`, the `/docs/api` page, and `pnpm openapi:check` in CI.

Remaining:

- GEDCOM 7 export, sharing the existing serializer. GEDCOM 5.5.1 export is shipped; import is tracked in item 1.
- A public share JSON feed under the existing share token, with the living-person redaction in `src/lib/share.ts`.
- Write scopes with conflict handling and an explicit merge policy. Reads were deliberately first.
- Webhooks for `person.created`, `export.completed`, and similar events, after the pull API settles.
- A strict delta feed with tombstones. The current `/changes` feed is derived from activity and cannot replay every child-row change.
- A shared rate-limit store when the app runs more than one replica. The current token buckets are in-process.

## 9. Smaller follow-ups

- Per-person or per-branch share links.
- Comment access on share links without edit rights.
- Object versioning and external, encrypted backups.
- A public status page and an external uptime monitor.
- HEIC decoding on the server for browsers that cannot read it.
- Free-text and seasonal dates, such as "spring 1918".
