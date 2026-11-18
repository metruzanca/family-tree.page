# Features

Everything the app can do, grouped by area. For the engineering behind these features, see [Architecture](architecture.md).

## Accounts and access

- Email and password accounts with encrypted session cookies.
- Email verification, password reset by email, and session invalidation on password changes.
- Email address changes with a confirmation link to the new address and a notice to the old one.
- Private family trees with owner, editor, and viewer roles, invited by copyable link or by email, with expiry and single use.
- Per-account storage and lifetime people limits, with a usage card in account settings.
- Download a copy of your account, trees, and media as a zip, or delete your account with ownership safeguards.
- Privacy policy at `/privacy` and terms at `/terms`, linked from the app and the registration form.

## People and relationships

- People, parent-child relationships, and partnerships.
- Add a child with a second parent in one step, and keep the dialog open to add several children quickly.
- Person profiles with parents, partners, children, and life notes.
- Social profile icons from Simple Icons, one personal-website house link, and optional contact email and phone.
- Sex per person, used for father and mother labels and GEDCOM `SEX`.
- Partial and approximate dates for people, partnerships, and photos, including unknown-year birthdays.
- A life events timeline for each person: residence, occupation, education, military service, migration, marriage, divorce, burial, and custom events.
- Duplicate person warnings before adding a similar name or birth year.
- Cycle-safe relationship analysis that stays bounded when relationships contradict each other, with an in-app warning and `pnpm db:check`.

## The graph

- Force-directed layout: parent and partner edges pull families into loose clusters, so relatives stay together and edges stay short.
- Every parent set meets at a marked family junction, so a couple and their children fan out from one knot instead of crossing lines.
- Links stop short of the avatars they connect and are cut wherever one would pass behind someone else, so a line through a stranger never reads as a relationship.
- Partner links arc above the couple, child links end in an arrowhead, sibling arms fan out in birth order, and a clearance force keeps people off lines that do not belong to them.
- A label-aware collision force keeps names readable, and disconnected branches find their own space.
- Optional birth-year gravity drifts older people upward without pinning rows, toggled from the toolbar and remembered per browser.
- Weak generation gravity settles each level in its own loose band, and partners always share a band.
- Media clusters around its owner through a short hidden spring and is drawn behind the graph, so a photo never covers a person.
- Parent arms follow the relationship type, and hovering a person lifts their own links above the dimmed ones.
- Search, neighbor highlighting, zoom and pan.
- Pointer cursor only over nodes, not links or empty canvas.
- Person and document info panels on desktop and mobile.
- Live refresh nudge when another member changes the tree.
- Mobile layout with a person sheet, touch gestures, and a list-free graph fallback through search.

The rendering rules are documented in [How the graph keeps lines honest](architecture.md#how-the-graph-keeps-lines-honest).

## Focused browsing

Every member can mark the person they represent from the focus menu in the graph toolbar. The graph then opens with distance rings around that person instead of the whole family:

- 1 hop: partner, parents and children
- 2 hops: siblings, grandparents, grandchildren and in-laws
- 3 hops: aunts, uncles, nieces, nephews and great-grandparents
- 4 hops: first cousins, great-aunts and great-uncles

The default is 4 for trees of 25 people or more, and Everyone below that. The Show more chip adds the next ring, Everyone reveals the whole tree, and the focus menu switches bands or changes who you are. Partners of visible people come along with them, so a spouse is never cut off one hop away. Unconnected people are always shown, and the chosen band is remembered per tree in the browser.

Selecting a search result or opening a deep link outside the focus reveals the shortest chain of relationships to that person, so they arrive in context without expanding every branch. Owners can unlink a member from the Members tab in tree settings.

This is a reading aid, not access control. The whole graph is still sent to every member.

## Media library

### How media works

1. The browser creates a small WebP or JPEG thumbnail with canvas.
2. The server returns presigned POST fields for the original and the thumbnail.
3. The browser uploads both directly to the bucket.
4. The server checks the object size, declared type, and magic bytes, then marks the file ready.
5. Thumbnails are served through `/api/files/:id/thumb` with a membership check and private cache headers.
6. Originals and documents redirect to a short-lived presigned URL after an authorization check.

The bucket stays private. Browsers never receive storage credentials. SVG, HTML, JavaScript, and executable files are rejected.

### The tree inbox

Uploads do not have to belong to anyone. A file uploaded without a person is unfiled: it waits in the tree inbox, is listed in the media gallery, and never appears on the graph or in share links. Editors can tag an inbox photo with people, which files it under the first person picked, or move it to a person's folder later. Storage keys for inbox files live under `trees/<treeId>/inbox/`.

Files still have one home, the person they are filed under, which is where a graph node lives. Deleting a person keeps their photos: those files return to the inbox, lose their portrait flag, and leave albums that disappear with the person.

### Gallery and folders

`/trees/:treeId/media` shows every image in the tree, grouped by year and ordered by the date taken with the upload date as a fallback. Filename search and a person filter narrow the grid, and selecting photos enables bulk actions: file under a person, delete, or clear. Clicking a photo opens the same lightbox used on the graph, so tagging, faces, dates, and portraits all work there.

The People tab is a file manager. Each person is a folder, the inbox sits at the top, and albums appear as subfolders. Drag a photo onto a folder to file it under that person, drag it back to the inbox to unfile it, or drop files from the desktop straight onto a folder to upload there. Touch and keyboard users get the same result through selection and "File under…".

Both views read the graph payload, so opening the media page costs no extra query. A tree with thousands of photos would eventually need a paginated media query; family-sized libraries do not.

### Photo tags and dates

Editors can tag any other people who appear in an image. Tags live in `file_tags` with tree-scoped foreign keys, so removing a person or a file removes the tags automatically. A tagged person sees the picture under "Also in photos" on their profile without becoming the owner.

Images also carry an optional `taken_at` date. The browser reads EXIF `DateTimeOriginal` with `exifr` during upload and uses it as the initial value; editors can change or clear it in the file panel or lightbox. This is separate from the upload date, so scanned photos can be dated to when they were actually taken, and the date can be partial or approximate.

`file_tags` records the people in a photo with a `source` of `manual` or `face`. The tag picker links someone without a box, which is also the fallback when a face is not detected.

### Faces

Editors can link people to individual faces in a photo. Detection runs in the browser with MediaPipe BlazeFace, using the app's own copy of the WASM runtime and model, so photos and face data never reach a third party.

- The detector runs on the 640 px thumbnail after an image upload and on demand from "Check for faces" in the lightbox. Browser support is required; unsupported browsers fall back to tagging without boxes.
- Only the box is stored, in `file_faces`, as normalized `x`, `y`, `width`, and `height` fractions. No embedding or identity template is created, so nothing can match a face across photos.
- An unassigned box waits for an editor to link a person. Linking writes a `file_tags` row with `source = face`, so profiles, "Also in photos", activity, and exports keep working.
- When the first check finds exactly one face, it is linked to the person the photo is filed under. Unlink it if the detector caught someone else. An unfiled photo waits in the inbox with an unassigned box until someone tags it. Re-scans never re-apply this, so an unlink stays put.
- In a group photo, people already tagged in the picture appear first in the picker under "Already in this photo", followed by everyone else alphabetically.
- If the detector misses a face, "Add a face" draws a box and links a person in one step. The photo owner is already linked by ownership, so no duplicate tag is created.
- "Not a face" keeps the box but hides it and protects it from re-scans. Removing a person from the tag list unassigns their face and keeps the box. Re-scanning matches boxes by overlap, so links and ignored faces survive.
- Share links and the demo never include face boxes or the scan marker. Deleting a person unassigns their faces; deleting a photo or tree removes them.

Other media features:

- Image, PDF, and document uploads attached to people.
- Client-generated thumbnails, server-side content validation, and private file access.
- Multi-file uploads become albums rendered as stacked nodes on the graph.
- Portraits stay on the person node and are not duplicated as file nodes.
- Full-screen image lightbox with a details sidebar.
- Photo gallery grouped by year, with filename search and person filters, plus bulk filing and deletion.
- People folders that mirror a file manager, where dragging a photo onto a person files it under them.
- A tree inbox for uploads that do not belong to a person yet; tag the photo to file it, or drag it later.
- Tag other people in a photo, with an "Also in photos" section on each tagged person's profile.
- Optional date taken on photos, prefilled from EXIF and editable as a partial or approximate date.

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

Each person has a timeline of life events. An event has a kind (residence, occupation, education, military service, immigration, emigration, marriage, divorce, burial, or other), an optional title, a place, a fuzzy date, and notes. Editors can add, edit, and delete events from the person panel. Events are included in account exports and are removed with the person or tree.

A parent's timeline also lists the birth of each child who has a birth date on their own record. These entries are derived, not stored as events: they are read-only from the parent, and selecting one opens the child. `buildLifeTimeline` in `src/lib/person-events.ts` merges both sources and sorts them by fuzzy date.

## Research desk

The research desk is at `/trees/:treeId/research`. It renders the tree as text rather than as a canvas, because genealogists work in standard document shapes: a family group sheet to file, a pedigree to print, a surname index to scan, and a place index to search records by.

The views share one focus person, chosen from a picker or passed as `?person=`. Every view is linkable and supports browser back.

- **Family sheet** groups children by their exact parent set, so a second marriage, a single parent, and a childless couple each get their own sheet. It shows both parents, their dates and places, their life events, the partnership, and a child table with birth, death, and partner.
- **Dossier** is everything known about one person: a merged chronology, parents, partners with the children shared with each, children, siblings, media, open questions, and the relationship to the signed-in member when they have claimed a person.
- **Pedigree** uses Ahnentafel numbering: the subject is 1, parents are 2n and 2n+1, and each generation doubles. The chart stops at seven generations and reports when an ancestor still has more parents.
- **Descendants** offers the two North American systems. Register numbers only the people whose line continues and labels children with lowercase Roman numerals. NGSQ numbers everyone in reading order and marks a continuing line with a plus.
- **Surnames** clusters spellings that are likely the same family. Soundex buckets candidates and an edit distance of two or less decides the merge, so Smith, Smyth, and Smythe group together while White and Wade stay apart. Maiden names are included.
- **Places** parses a place on commas, canonicalizes case and spacing, and groups every birth, death, and life event under it. It also counts births and dated events with no place, because that is the next record to find.
- **Issues** is a research queue. Warnings are contradictions that cannot all be true: a death before birth, a parent under twelve, a child born long after a parent died, a partnership that ends before it starts, or more than two parents. Gaps are missing dates, places, relationships, and possible duplicates.

All views live in `src/lib/research/` as pure functions with tests, and the components in `src/components/research/` only render their output. `buildResearchIndex` groups parents, children, partners, events, and media once, and the views reuse that index. Dates sort with `fuzzySortValue`, so unknown dates go last instead of pretending to be year zero. A parent cycle is bounded rather than followed forever.

People record sex as female, male, other, or unknown. The pedigree labels a known male parent as father and a known female parent as mother, and falls back to parent for other or unknown. Relationship labels stay neutral, so the desk never guesses at aunt or uncle. GEDCOM export uses the same field for `SEX` and, when a couple is one male and one female, for `HUSB` and `WIFE`.

The full researcher feature guide, including GEDCOM and the API, is in [docs/research.md](research.md).

## Sharing and privacy

Tree owners control who joins, what they can do, and what the outside world can see.

### Demo and share links

`/demo` runs the real tree workspace on the static sample data from `src/components/landing/demo-tree.ts`. It has no account, no presence, and no write actions, and it shows a banner that links to registration.

Tree owners can create public read-only links from the Sharing tab in tree settings. Each link stores only a SHA-256 hash of its token, so the URL is shown once at creation. A link can have a label, an expiry from one day to ninety days or no expiry, and can be revoked immediately. Revoked, expired, or unknown tokens show a simple unavailable page.

Living people are anyone without a recorded death date. The default share setting is names only: names and relationships, with dates, places, biographies, portraits, events, and media removed. Owners can instead hide living people entirely or show full details. When media is enabled, only image thumbnails are served, never original files or documents, and a thumbnail request for a living person is rejected unless the link allows full details. Share responses send `X-Robots-Tag: noindex` and `Cache-Control: private, no-store`.

### Your data

Account settings has three exits for your own data:

- **Change email.** A confirmation link goes to the new address and a notice goes to the old one. The old address keeps working until the new one confirms. Pending changes can be cancelled from account settings.
- **Download your data.** `GET /api/account/export` streams a zip with `family-tree-export.json` and a README. The manifest covers your profile, memberships, trees, people, relationships, groups, tags, life events, and file metadata. Add `?media=1` to include every original photo and document, or `?format=json` to download the manifest alone. Exports are rate limited to three per hour per account.
- **Delete account.** This requires your password and a typed email confirmation. Trees where you are the only member are deleted with their storage objects. If you are the last owner of a shared tree, promote another owner or delete that tree first. Deleting your account clears the session and cascades memberships, calendar feeds, birthday logs, auth tokens, and pending email changes.

Account settings also shows storage and people usage against your limits, with a link to ask for more. The published policy is at `/privacy` and the terms are at `/terms`. See [Privacy and GDPR](operations.md#privacy-and-gdpr) for the engineering side.

## Collaboration

### Tree activity

Every meaningful change writes a row to `tree_activity` with an actor name snapshot, an action, the affected person when there is one, a human summary, and field-level before and after values for person and event edits. The activity page is at `/trees/:treeId/activity` and is visible to every member. It supports filtering by person, member, and type, with cursor pagination.

The actor name is snapshotted. Deleting an account replaces the actor with "Former member" instead of erasing the history. Rows are deleted with the tree.

### Presence

Live presence: see who else has the tree open, which person, file, or album they are looking at, and a colored ring and name tag around that node. See [How presence works](architecture.md#how-presence-works).

### Live refresh

The presence WebSocket also carries a `tree-changed` message, so open tabs revalidate the graph after a short debounce. If a dialog is open, the refresh waits until it closes and a toast explains why. See [Live refresh](architecture.md#live-refresh) for the details.

## Calendar

- Calendar tab with birth and death anniversaries, plus upcoming birthdays for living relatives.
- Subscribe to all tree birthdays from Google Calendar, Apple Calendar, or Outlook with a private iCal URL.
- Email birthday reminders, with one-week, day-before, and day-of toggles in account settings.

Internals are in [Birthday emails](architecture.md#birthday-emails) and [Calendar subscriptions](architecture.md#calendar-subscriptions).

## GEDCOM

GEDCOM 5.5.1 and 7 export from tree settings and the API, with dates, places, events, notes, media references, and families. GEDCOM 5.5.1 import works into a new or existing tree, with a parsed preview, per-person create, merge, or skip decisions, and gap-filling merges.

Details are in [GEDCOM](gedcom.md).

## Deleting a tree

Deleting a tree is deliberately slower than leaving one. The controls live in the **Danger** tab of tree settings.

1. An owner types the exact tree name. The request dialog shows the tree's people and member counts so the wrong tree is hard to pick by mistake.
2. If the tree has one owner, that confirmation schedules the deletion. If it has several, the request waits for every current owner to approve. Each approval is its own confirmation, co-owners get an email, and the request lapses after 14 days if not everyone agrees. Any owner can cancel it.
3. When every owner approves, the tree is locked. Its URLs redirect to `/trees`, invites and share links are revoked, and it drops out of birthday emails, calendar feeds, and presence.
4. The tree and its files stay in place for 30 days. `/trees` shows it under **Recently deleted** with the purge date and a Restore button. Any owner can restore it instantly, even if they were not the person who requested the deletion.
5. Seven days before the purge, every member with a confirmed address gets a reminder email.
6. The daily maintenance job deletes the tree's storage prefix, then the database row, which cascades people, relationships, files, tags, faces, events, activity, invites, and share links. Storage goes first: if it fails, the row stays so the next run retries instead of leaving orphaned objects.

`pnpm tree:purge -- <treeId> --yes [--force]` is the operator-only escape hatch for a legal erasure request. It skips the grace period and is deliberately not reachable from the app.

Account deletion is separate and still immediate for trees where the user is the only member, since no account remains to restore them. An owner of a shared tree must transfer ownership or delete the tree first.

## Known limitations

- No realtime co-editing. The graph refreshes after changes and a live nudge refreshes other open tabs, but edits are not merged character by character.
- Duplicate detection is heuristic. There is no merge tool yet, so "Add anyway" can still create a duplicate.
- Share links cover a whole tree. There is no per-person sharing or comment access yet.
- Presence is held in the app process. It works as-is on a single Railway replica. Running more than one replica needs a shared presence store, such as Redis or Postgres `LISTEN`/`NOTIFY`.
- HEIC photos work only when the browser can decode them; otherwise the user is asked to export as JPEG.
- Backups live in a second Railway bucket in the same region and are not encrypted by the app. Backups run daily, so enable PostgreSQL point-in-time recovery for the gap between dumps.
- Dates are Gregorian and structured. Seasons and free-text dates such as "spring 1918" are not represented; use an event note for those.
- Focus is a presentation aid, not access control. The whole tree is still loaded for every member, and anyone can reveal all branches with one click.
- The API is read-only. There are no write scopes, webhooks, or GEDCOM import yet. See [docs/roadmap.md](roadmap.md) for the deferred work.
- GEDCOM merge fills only empty fields. It never overwrites a non-empty value, and it does not import media binaries or create source records.
- GEDCOM 5.5.1 has no neutral couple roles. Same-sex and unknown-partner families export `HUSB` and `WIFE` by stable order, with a note in the file header. Review those roles after importing.
- The API changes feed is derived from tree activity, not a strict per-row delta with tombstones. Use `export.json` when a client needs a guaranteed snapshot.
- No printable chart export, OCR, or face recognition yet. Face detection and manual linking ship, but names are never suggested.
