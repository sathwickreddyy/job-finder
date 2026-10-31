# Edit tag and the two rejection tags — design

Status: approved 2026-11-01, with the gallery picks below.

## Picks from the live gallery (`/gallery/edit-tag`, 2026-11-01)

| Section              | Pick | What it means                                                                                                                       |
| -------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| The Edit tag popup   | C    | Two steps in one dialog: pick the tag from cards that say what each tag means, then a second screen asks "Change this email's tag?" |
| After you confirm    | A    | The dialog closes and a snackbar says "Tagged as …" with Undo for six seconds.                                                      |
| Where Edit tag lives | A    | A pencil right after the tag on every email row; it appears on hover or keyboard focus and is always visible on touch screens.      |

The gallery stays at `/gallery/edit-tag` as the record of these picks. This replaces the inline
"Change tag…" pills shipped in `18bfa6b` (2026-10-31).

## Why

An Oracle rejection arrived tagged Application. `18bfa6b` added a way to fix it, and the user
rejected it on 2026-11-01: "not a good ux, no confirmation, no popups, no behaviors". One click on a
pill changed the tag with no confirmation and nothing to say it had worked. What they expected was
an Edit tag button that opens a popup with the correction and a confirm button.

They also found that there is no "Application rejected" tag, and asked for two tags: rejected
before any interview, and rejected after interviews.

## Goals

1. Fix any email's tag from its row in two deliberate steps, with clear feedback and Undo.
2. Split Rejection into **Application rejected** and **Rejected after interview**, sorted
   automatically from the user's own records.

## Non-goals

- Better classifier phrases (for example, why the Oracle email was not read as a rejection at all).
  That is separate work.
- Bulk retagging, retag rules, or learning from corrections.
- Edit tag on the Applications calendar's tag icons. It lives on mail rows only.
- Recording outcomes. Retagging never records an outcome or changes an application's status.

## Anti-goals

- A tag changing before the user presses the confirm button.
- Retagging that handles the email, moves it to another company or unlinks it.
- Automatic sorting that overrides a tag the user chose.

## 1. The two rejection tags

| Tag id                | Label                    | Icon (lucide)    | Meaning shown in the popup            |
| --------------------- | ------------------------ | ---------------- | ------------------------------------- |
| `applicationRejected` | Application rejected     | `FileX`          | Turned down before any interview.     |
| `interviewRejected`   | Rejected after interview | `MessageSquareX` | Turned down after one or more rounds. |

- Both replace `rejection`, use the existing rejection colour pair (`--tag-rejection*`) and the
  `rejected` stage. In existing tag lists (filter pills, counts) they take Rejection's place,
  Application rejected first. The popup orders all tags by stage, as the gallery does.
- Storage: tags are derived from `classification`, never stored. `REJECTION` stays and now means
  application rejected. A new `INTERVIEW_REJECTION` value is added to the `mail_classification` enum
  with a migration, the same way `0013_job_mail_tags.sql` added values.
- Every place that treats `REJECTION` specially also covers `INTERVIEW_REJECTION`:
  `features/mail/attention.ts` (no attention reason), `features/mail/triage.ts` (`updateKinds`,
  `suggestedOutcome` → `"rejected"`), `features/applications/lanes.ts` (`mailLabel`),
  `features/mail/tags.ts` (`tagClassifications`, `kindLabel`: "Application rejected" and "Rejected
  after interview"). The compiler lists the `Record<MailClassification, …>` maps.
- The classifier never returns `INTERVIEW_REJECTION`. It still says `REJECTION`, and the sort in §2
  decides between the two.
- Old links keep working: `?tag=rejection` and the legacy `rejected` id show both new tags, through
  `legacyTags`. `PATCH /api/v1/mail/{id}` with `tag: "rejection"` means `applicationRejected`.
  `GET /api/v1/mail` returns the new ids.
- Gallery fixtures that use `rejection` (`feed-polish`, `feed-gallery`, `edit-tag-gallery`) move to
  the new ids so they still compile. Their look does not change.

## 2. Sorting rejection mail

Rule (the user's, 2026-11-01: "sort by whether an interview was recorded first"):

> A `REJECTION` email placed at exactly one company becomes `INTERVIEW_REJECTION` when that company
> has at least one interview round that took place before the email arrived. Otherwise it stays
> `REJECTION` (Application rejected).

- A round is an `application_rounds` row on any application at that company, any role, with an
  outcome other than `CANCELLED` and a `scheduledAt` before the email's `receivedAt`. A round with
  no `scheduledAt` counts by its `createdAt`.
- An email with no company, or with more than one, stays Application rejected.
- The sort runs when a new email is first stored. Every route stores mail through
  `importMailRecords` (`features/mail/import.ts`): Fetch new mail and company search through
  `ingestPage`, Include this through `include.ts`, and the JSON import action. The company is only
  decided after that call, in `ingest.ts` and `include.ts`, so the sort runs there once the company
  is set, and only for newly imported messages (`imported.imported`). JSON imports have no company
  and stay Application rejected. It also runs once over existing mail (§3).
- It never runs again on the same email. Placing or linking the email, or recording rounds later,
  does not re-sort it, and a tag chosen in Edit tag always wins.
- Keep the rule as a pure function, for example `rejectionKind(receivedAt, rounds)`, so it can be
  tested without a database.

## 3. One-time sort of existing mail

- Existing `REJECTION` mail is sorted once with §2's rule, using each message's `companyKey`. Its
  `mail_events.type` is updated to match, as `updateMail` already does.
- Mail with a `MAIL_RETAGGED` activity log is skipped: a tag the user chose wins. This covers mail
  retagged to Rejection with `18bfa6b`.
- Constraint: Postgres cannot use a new enum value inside the transaction that adds it, and
  drizzle's migrator applies pending migrations in one transaction. So the sort must run after the
  migrations commit, for example in `scripts/docker-migrate.mjs` after `migrate()`, guarded by a
  `settings` marker so it runs once. The test-database setups need the same step. It must be safe
  to run twice, and it logs one activity entry with the number of emails moved.
- It is reversible: moving `INTERVIEW_REJECTION` back to `REJECTION` undoes it.

## 4. Edit tag

### The button (pick A)

- Every row in the shared mail ledger (All job mail, company panes, company timelines) shows a
  pencil icon button right after its tag pill. Its accessible name is "Edit tag".
- It appears on row hover and keyboard focus, and is always visible where hover is not available
  (`@media (hover: none)`). It works on open and handled mail alike.
- Today each row is one `<button>` that opens and closes the email, and a button cannot contain
  another button. Restructure the row so the pencil is a sibling: for example, keep the toggle as a
  button whose `::after` stretches over the row, and lift the pencil above it (the lanes view
  already lifts a `TagPill` with `relative z-10`). Pressing the pencil must not open or close the
  row. Tab order: the row's toggle, then its pencil.
- The inline "Change tag…" pills from `18bfa6b` go away (`ChangeTag` and its render test).
  `retagMailAction` stays and becomes Edit tag's save.

### The popup (pick C)

- A centred native modal `<dialog>`, like `timeline/drawer.tsx`. Escape, the scrim and the close
  button close it without changing anything. Focus returns to the pencil.
- **Step 1, "Edit tag".** The header shows the company and subject. Under it: "Pick the tag this
  email should have." and eleven tag cards in stage order, two columns (one on a phone). Each card
  has a tonal icon circle, the label and the one-line meaning. The current tag is shown but
  disabled, with "· now". Picking a card goes straight to step 2.
- **Step 2, "Change this email's tag?"** Shows the current pill → the new pill, then three lines:
  - It moves from _current_ to _new_ in the feed, filters and counts.
  - It stays at the same company and application, and still needs you (or stays handled, if it is
    handled).
  - You can change it again later.

  The footer has **Back** (to step 1, nothing changed) and a primary **Yes, change tag**.

- While saving, "Yes, change tag" shows a spinner and "Saving…". If the save is refused, the
  dialog stays on step 2 with the error under the buttons. On success it closes.
- Edit tag shows its own spinner instead of the app-wide loading popup, so feedback does not
  appear twice.

### After confirming (pick A)

- A snackbar at the bottom centre, using the inverse of the page colours (foreground and background
  tokens): a check mark, "Tagged as Rejected after interview" and **Undo**. It is announced politely
  (`role="status"`).
- It stays six seconds, and longer while hovered or focused. Only one shows at a time; a new one
  replaces the old.
- **Undo** restores the exact previous classification (Assessment stays Assessment, not just
  "Interview call") and logs `MAIL_RETAGGED` again. The snackbar closes and the row shows the old
  tag. Today `classificationForTag` picks a tag's main classification, so Undo needs a path that
  passes the exact classification back. That path accepts only values in `mailClassifications`.
- The row's pill updates in place. The email keeps its position and stays open or closed.

## 5. Tests

- Unit: tag ids, legacy params and `classificationForTag` for both new tags; the sort rule (round
  before, round after, cancelled round, no `scheduledAt`, no company, two companies).
- Database integration (`npm run test:db`, `jobops_e2e` only): ingest sorts a new rejection email;
  the one-time sort moves the right mail, is safe to run twice and skips hand-retagged mail;
  retag then Undo restores the exact classification.
- Render: each row has a pencil that is not inside the row's toggle button; both dialog steps; the
  snackbar.
- Browser (`npm run test:e2e`, port 3211; it starts a host test server, so run it only with the
  user's go-ahead): pencil → pick → confirm → snackbar → Undo; Escape and Back change nothing.

## 6. Housekeeping

- `AGENTS.md` (repository root) product scope gets a line for these picks and the two rejection
  tags, like earlier galleries.

## Left to the builder

- Component split; where the snackbar lives (a shared component in `src/components` is fine);
  migration numbering; exactly how and where the one-time sort is triggered; copy not quoted here.

## Calls made without the user (check these)

- The two tags' names, icons and meanings.
- `REJECTION` keeps its name and means Application rejected; the new value is
  `INTERVIEW_REJECTION`.
- "At that company" counts rounds for any role there; cancelled rounds do not count.
- Mail with no company, or more than one, stays Application rejected.
- Sorting happens once per email; a tag chosen by hand is never re-sorted.
- The snackbar stays while hovered, and Undo restores the exact previous kind.
- The pencil shows on every row, open or handled, but not on the Applications calendar.
