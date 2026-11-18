# Research features

This guide describes what the app offers genealogists today, where to find it, and what is deliberately deferred. It covers the research desk, the records behind it, GEDCOM, and the read-only API.

The short version: the app is good for recording a family, reviewing it for contradictions, printing standard research views, moving data between genealogy tools, and reading the tree from scripts. The next meaningful investment is evidence, not more views.

## The research desk

Open a tree and choose **Research desk** from the toolbar, or go directly to `/trees/:treeId/research`.

Seven views share one focus person. Every view is linkable with `?view=` and `?person=`, so a specific sheet or chart can be bookmarked, shared inside the family, or printed.

### Family group sheet

The unit researchers file and exchange: one couple, their events, and their children.

- Children are grouped by their exact parent set, so a second marriage, a single parent, and a childless couple each get their own sheet.
- Both parents show names, maiden and known-as names, birth, death, places, biography, and life events.
- The partnership shows status and start and end dates.
- A child table shows birth, death, and partners.
- A family selector appears when the focus person belongs to more than one family.

### Individual dossier

Everything known about one person on one page.

- A merged chronology of birth, death, and life events, sorted by the fuzzy date. Undated events go last instead of pretending to be year zero.
- Parents, partners with the children shared with each, children, and siblings.
- Photos and documents the person owns or is tagged in.
- An **open questions** list: no birth date, no birth place, no parents, no partner or children, no life events, no media, no biography.
- A relationship label relative to the signed-in member when they have claimed a person, such as "first cousin once removed", with the path.

### Pedigree

Ancestors with Ahnentafel numbering, the standard text chart.

- The subject is 1, parents are 2n and 2n+1, and each generation doubles.
- The chart stops at seven generations and reports when an ancestor still has more parents.
- A known male parent is labelled **father**, a known female parent is **mother**, and other or unknown sex reads as **parent**.
- Parents beyond the two the chart can place are reported rather than dropped silently.

### Descendant register

Both North American numbering systems, with a toggle:

- **Register** numbers only the people whose line continues and labels each child with a lowercase Roman numeral.
- **NGSQ** numbers everyone in reading order and marks a continuing line with a plus.
- Nested lists show generations without a canvas, and the view prints cleanly.

### Surname index

Every surname, with likely spelling variants grouped.

- Soundex narrows the candidates, then an edit distance of two or less decides a merge.
- Smith, Smyth, and Smythe group together. White and Wade stay apart.
- Maiden names are included.
- Each group shows counts, a birth-year range, variants, and links to each person.

### Place index

Records grouped by place, because parish registers and civil records are place-based.

- Places are split on commas into a hierarchy and normalized for case and spacing.
- Births, deaths, and life events are grouped under the place.
- The view counts births with a date but no place, and dated events with no place, which is the next record to find.
- Records are sortable by date and person.

### Issues queue

A research queue, not a validator. Warnings are contradictions that cannot all be true, and gaps are missing data worth chasing.

Warnings:

- Death before birth
- A parent under twelve
- A child born more than a year after a parent died
- A partnership that ends before it starts
- A partnership that starts before a partner was born
- More than two parents for one person

Gaps:

- People with no relationships
- People with no birth date
- Births with no place
- Dated events with no place
- Possible duplicate names with overlapping birth years

## Records and evidence

The views only work because the records carry enough detail:

- **Sex** is recorded as female, male, other, or unknown. It drives father and mother labels and GEDCOM `SEX`.
- **Fuzzy dates** keep partial and approximate values: exact, about, before, after, between, or unknown, with an optional day and month. A birthday with no year is valid.
- **Life events** cover residence, occupation, education, military service, immigration, emigration, marriage, divorce, burial, and custom events, each with place, fuzzy date, and notes.
- **Partnerships** carry a status and start and end dates. Parent links carry a parent type: biological, adoptive, foster, step, or unknown.
- **Media** is attached to people and albums, with document and photo support, tags, and faces.
- **Duplicate detection** warns before creating a similar person, using names, maiden names, nicknames, and birth-year overlap.
- **Activity history** records who changed what, with field-level before and after values.
- **Printing** is built into every research view, with a print header and page-break protection on person cards.

The research logic lives in `src/lib/research/` as pure functions with tests. The route only renders their output. That keeps the numbering, matching, and issue rules testable without a browser.

## GEDCOM

GEDCOM is the exchange format between genealogy tools. The app exports 5.5.1 and 7.0, imports into a new tree, and merges into an existing tree with a review.

### Export

Tree settings has **GEDCOM 5.5.1** and **GEDCOM 7** on the Tree tab. The API serves the same files.

- 5.5.1 is the default for the widest support, including Ancestry, MyHeritage, Gramps, RootsMagic, and Family Tree Maker.
- 7.0 is for newer tools: a 7 header, no `CHAR` or `GEDC.FORM`, no `CONC`, MIME media types, `TITL` under `FILE`, and `SEX X` for other.
- Both include names, nicknames, maiden names, sex, dates, places, birth and death, life events, notes, media references, and families.
- Dates use the standard approximations: `ABT`, `BEF`, `AFT`, and `BET ... AND ...`.
- Long 5.5.1 values wrap with `CONT` and `CONC`. 7 values use `CONT` only.
- Every person and partnership carries a `_ROOTS_ID`, and every media record a `_ROOTS_FILE_ID`, so external tooling can trace a record back to the app.

GEDCOM 5.5.1 has no neutral couple roles. A mixed-sex couple gets the male as `HUSB` and the female as `WIFE`. Same-sex and unknown couples keep stable partner order, and the file header says so.

Limits: ten exports per hour per account or token.

### Import into a new tree

The trees page has **Import** next to **New tree**.

- Choose a `.ged` file, review the parsed counts and warnings, name the tree, and import.
- The preview parses in the browser. The server parses the file again before writing.
- People, families, events, and one activity entry are written in one transaction. A failed import leaves no partial tree.
- The account people quota still applies. An over-quota import rolls back.
- Limits: 5 MB, 5,000 people, and five new-tree imports per hour.

### Review and merge into an existing tree

Tree settings, then **GEDCOM**, then **Import into this tree**.

- Every person gets a row with **Create**, **Merge**, or **Skip**.
- The duplicate detector suggests a match. An exact full name or a strong score defaults to Merge, and every row can be changed.
- A merge picker lists everyone in the tree, with the suggestion preselected.
- A merge only fills empty fields. It never overwrites a non-empty name, date, place, sex, or biography.
- Existing parent links and partnerships are left alone, and identical events are not duplicated.
- Two imported people cannot merge into the same existing person. A merge without a target blocks the apply.
- The server re-plans and validates the decisions in one transaction before writing.
- Re-importing a tree's own export leaves every person, link, and event count unchanged.
- Limit: ten merges per hour.

Media binaries and source citations are not imported. GEDCOM contains references, not the files, and the app does not have source records yet. Both are reported in the preview. Family notes, unreadable dates, missing references, and tags without a matching field also become warnings rather than silent guesses.

## Developer API

Every tree can issue read-only bearer tokens from tree settings, under **Sharing**. Only an owner can create one. A token is bound to that tree, stored only as a SHA-256 hash, shown once, expiring if requested, and revocable.

The API lives under `/api/v1`:

- `GET /me` describes the token, its scopes, and its tree.
- `GET /trees` and `GET /trees/:treeId` return tree metadata and counts.
- `GET /trees/:treeId/people` accepts `q`, `surname`, `limit`, and `cursor`.
- `GET /trees/:treeId/people/:personId` returns the person, immediate family, events, and media.
- `GET /trees/:treeId/relationships`, `/events`, `/search`, and `/changes`.
- `GET /trees/:treeId/export.json` returns a complete snapshot.
- `GET /trees/:treeId/gedcom` returns 5.5.1, or 7 with `?version=7`.
- `GET /trees/:treeId/media/:fileId/thumb` and `/download` serve binaries with the same token.

Scopes: `tree:read`, `people:read`, `media:read`, `changes:read`, `export:read`.

- Lists use an opaque cursor over `(updatedAt, id)`.
- Tree metadata, relationships, and exports support `ETag` with `If-None-Match`.
- Requests are limited to 120 per minute per token. Exports are limited to 10 per hour.
- The changes feed is derived from the human activity log. It is a change log, not a byte-level diff.
- The contract is `openapi/roots-v1.json`, served at `/api/v1/openapi.json`, rendered at `/docs/api`, and checked by `pnpm openapi:check` and a DTO contract test.
- A browser client on another origin needs that origin in `API_ALLOWED_ORIGINS`.

Owner tokens expose the whole tree, including living relatives, by design. The public share links stay redacted.

## Sharing and privacy

- **Public share links** are read-only, can hide or reduce living people, optionally include thumbnails, and can expire or be revoked.
- **Owner API tokens** are full-data and intended for trusted researchers and their tools.
- **Account export** downloads a zip with the account, trees, and optional media.
- **Prints and PDFs** are generated from the research views with the same data the member can already see.
- **Focus is a reading aid**, not access control. A member can reveal the whole tree.

## What is good for now

The current set covers the core research loop:

1. Record people, relationships, events, media, places, and dates.
2. Review the tree for contradictions and gaps in text views.
3. Print family group sheets, dossiers, pedigrees, registers, and indexes.
4. Move data between tools with GEDCOM export and reviewed import.
5. Read the tree from scripts through a documented, versioned API.

More text views would not solve the main remaining problem. The app can tell you that a birth date is missing, but not who said so, which record proves it, or how confident you should be. That is the evidence layer, and it is the next real step.

## Possible next steps

### 1. Sources and citations

The largest gap for researchers. Add tree-level sources (title, author, publisher, repository, URL, accessed date, notes) and citations that point at a specific fact or event, with a page or film detail and a confidence level.

Then surface them in the places that already exist: citations beside birth and death in the dossier and group sheet, a source register view in the research desk, and a source index that shows which people a record supports. Export and import them as GEDCOM `SOUR` records and `REPO` repositories.

### 2. GEDCOM import fidelity

- Full GEDCOM 7 import validation. The parser already reads 7.0 best effort, including `SEX X` and shared notes.
- Source and repository records once the model exists.
- Media by filename or an uploaded bundle. Today media is counted and skipped.
- Resumable processing beyond the 5 MB and 5,000 people limits.
- Let the reviewer change relationship and event decisions, not just person decisions.
- Optional overwrite of non-empty fields, with a diff, instead of fill-only merges.

### 3. Research workflow

- Research tasks and open questions per person or branch, so the queue is shared.
- Comments on a person, for "is this the right John?" conversations.
- Saved searches and a "changed since" digest.
- Place authority: canonical places, hierarchy, and a merge step for variants.
- Name variants with types (birth, married, religious, also known as) and GEDCOM `NAME.TYPE`.

### 4. Person merge tool

Duplicate detection warns, but there is no merge flow. Compare two people side by side, choose the surviving value per field, reparent relationships without cycles, move media and tags, and write one activity entry that explains the merge.

### 5. Search and OCR

Full-text search across names, notes, sources, and event text, then OCR for scanned letters, certificates, and newspaper clippings. OCR should suggest dates and names for an editor to accept, never apply them automatically.

### 6. API follow-ups

- Write scopes with conflict handling.
- Webhooks for person and export events.
- A public share JSON feed using the existing redaction.
- A strict delta feed with tombstones. The current changes feed is activity-derived.
- A shared rate-limit store when the app runs more than one replica.

### 7. Printable posters

A poster renderer with paper sizes, page breaks, a legend, a title block, branch focus, and optional living-person redaction. The graph layout should settle before a poster format is locked in.

## Where the code lives

- `src/lib/research/`: the research index, group sheets, dossiers, numbering, surname and place indexes, issues, and kinship. Pure functions with tests.
- `src/components/research/`: the seven views.
- `src/routes/trees/[treeId]/research.tsx`: the research desk route.
- `src/lib/fuzzy-date.ts`: partial and approximate dates.
- `src/lib/gedcom.ts`: GEDCOM 5.5.1 and 7 export.
- `src/lib/gedcom-import.ts`: the parser and warnings.
- `src/lib/gedcom-match.ts` and `src/lib/gedcom-plan.ts`: duplicate suggestions and the reviewed merge planner.
- `src/routes/trees/[treeId]/import.tsx`: the merge review page.
- `openapi/roots-v1.json`: the API contract.
- `docs/roadmap.md`: deferred work and open questions.
