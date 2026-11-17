# Roadmap

Deferred work beyond v0.1.0. None of this is shipped yet. The order is a suggestion, not a commitment.

## 1. GEDCOM import and export

GEDCOM is still the common exchange format between genealogy tools, so it is the highest-value interoperability feature.

Scope:

- Export people, parent-child links, partnerships, names, dates, places, notes, and media references.
- Import GEDCOM 5.5.1 first, with GEDCOM 7 as a follow-up.
- Map fuzzy dates to GEDCOM date approximations and back without losing qualifiers.
- Preview imports, report skipped or ambiguous rows, and never merge silently.
- Keep the operation resumable, because large files can exceed a single request.

Open questions:

- Whether media should be embedded or referenced by relative path.
- How to map custom life events to standard GEDCOM event tags.
- Whether to reuse the duplicate detector as an import review step.

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

## 7. Smaller follow-ups

- Per-person or per-branch share links.
- Comment access on share links without edit rights.
- Object versioning and external, encrypted backups.
- A public status page and an external uptime monitor.
- HEIC decoding on the server for browsers that cannot read it.
- Free-text and seasonal dates, such as "spring 1918".
