# GEDCOM

GEDCOM is the interchange format other genealogy tools read. This app exports 5.5.1 and 7, and imports 5.5.1.

## Export

Tree settings has **GEDCOM 5.5.1** and **GEDCOM 7** downloads on the Tree tab, and the API exposes the same files at `GET /api/v1/trees/:treeId/gedcom` with the `export:read` scope, adding `?version=7` for the newer format. Both are limited to ten exports per hour.

5.5.1 is the default because Ancestry, MyHeritage, Gramps, RootsMagic, Family Tree Maker, and most other tools import it. 7 is there for tools that support it: a 7.0 header, no `CHAR` or `GEDC.FORM`, no `CONC`, MIME media types, `TITL` under `FILE`, and `SEX X` for other. Both versions import into this app, with 5.5.1 the better tested path.

The file contains:

- A header with UTF-8, LINEAGE-LINKED, a submitter, and a note about couple roles.
- One `INDI` per person with the primary name, nickname, maiden name, birth, death, biography, life events, and media references.
- One `FAM` per parent set or partnership, with `HUSB`, `WIFE`, and `CHIL`, plus marriage, divorce, separation, partnership, or widowed events.
- `OBJE` records that reference the original file name, not the stored binary.
- `_ROOTS_ID` on every person and partnership, so a future import can match records instead of guessing.

Dates use the standard approximations: `ABT`, `BEF`, `AFT`, and `BET ... AND ...`. Partial dates keep their precision, and a date with no year is omitted rather than invented. Long notes and biographies wrap with `CONT` and `CONC`.

GEDCOM 5.5.1 has only `HUSB` and `WIFE` for a couple. When one partner is male and the other female, the roles follow sex. Same-sex couples and unknown partners keep stable partner order, and the file header says so, because the format has no neutral roles. Review those families after importing. Media records point at file names and do not embed binaries, which matches how most tools handle media.

## Import

The trees page has **Import** next to **New tree**. Choose a `.ged` file, review the people, families, events, and warning counts, name the new tree, and import. The preview parses in the browser; the server parses the file again before writing anything.

To merge into an existing tree, open **Tree settings**, then **GEDCOM**, then **Import into this tree**. Every person in the file gets a row with **Create**, **Merge**, or **Skip**. The duplicate detector suggests a match, an exact full name or a strong score defaults to Merge, and every row can be changed before applying.

Import always creates a new tree and never touches an existing one. It reads GEDCOM 5.5.1 names, sex, dates, places, birth and death, life events, notes, parent-child links, and partnerships with marriage, divorce, separation, or widowed dates. Duplicate family records are merged. Missing references, unreadable dates, and unsupported tags become warnings instead of silent guesses.

- People and families are written in one transaction, so a failed import leaves no partial tree.
- A merge only fills empty fields. It never overwrites a non-empty name, date, place, sex, or biography.
- Existing relationships and identical events are left alone, so re-importing the same export is effectively a no-op.
- Two imported people cannot merge into the same existing person, and a merge without a target blocks the apply.
- The account people quota still applies. An import that would exceed it rolls back.
- Imports are limited to 5 MB and 5,000 people, to five new trees or ten merges per hour per account.
- Media files and source citations are skipped because a GEDCOM file contains references, not the files or a source model.
- Full GEDCOM 7 import validation, source records, media bundles, and resumable processing for very large files are follow-ups.

The parser lives in `src/lib/gedcom-import.ts` with tests, including a round trip from an exported tree back through the parser.
