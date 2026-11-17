# Company page redesign

Status: approved · implemented on company-page-redesign · 2026-11-17 · builds on
[company application tracking](2026-11-16-company-application-tracking-design.md)

## Why

The company page (`/companies/<slug>`) is where the user tracks every application to one company.
After the tracking work it holds the right information but reads badly:

- **Header noise.** Two "Interviewing" chips (the stage chip and the company status pill say the
  same thing), then the tagline, the next step and "Add previous job" as three loose lines.
- **Plain text.** An open application starts with a label/value grid of plain text, then a loose
  "Set a follow-up" button, an "Application page not saved" line, the tracker, and a large empty
  "Add to history" textarea before any activity.
- **Overlap.** The "How we find <company>'s mail" form sits directly under the last application row
  with no gap and reads as part of that row.
- **New mail is hard to spot.** An email that needs a role (for example four "Thank you for
  applying to Amazon" emails) repeats the whole chooser on every card: four role buttons, Just info,
  "Choose the role this email is about." and "Place at…". Its preview line is a raw tracking URL.
  Nothing says the email is new.

Success: opening the page, the user sees at a glance where the company stands, which application
needs them, what to do next, and which emails are new — with every existing action still one or
two clicks away.

## Goals

1. One status, one next step, few buttons in the header.
2. Application rows that read role-first with visible progress.
3. An open application that leads with the current step and its action, keeps facts in a tidy
   sidebar, and shrinks note entry to one line.
4. Mail-search settings out of the way, with clear space from the application list.
5. New mail that is obvious, one line per email, with a single compact control and a role hint.
6. Email previews without raw links, everywhere they appear.

## Non-goals

- No change to the Compensation, Interview loop and About & sources tab contents (they keep
  `MetricTiles` and their sections; only the shared header changes).
- No change to the `/mail` page layout, the mail-search rule semantics, or the transition API.
- No database migration. The only data-shape change is one extra field on `Handling` (below).
- No automatic linking. The role hint suggests; the user still chooses.

## Anti-goals

- **Dropping a control.** The previous branch had to restore several actions the redesign lost.
  Every control in the inventory below must survive, even if it moves.
- **Duplicate actions.** The same outcome buttons must not appear in two places on screen.
- **Hiding urgent state.** Overdue steps and new emails must be more visible than today, not less.

## Constraints

- Next.js 16 App Router, React 19, Tailwind 4 with container queries, existing tokens in
  `src/styles/theme.css` (dark and light). System font stack. lucide-react icons. No new
  dependencies.
- Reuse the existing data readers and server actions; restyle and recompose components in place.
- Must look right in both themes and at 375 px wide with no horizontal scroll.
- Keyboard and screen-reader access: menus are buttons with `aria-expanded`/`aria-controls`,
  Escape closes, focus returns to the trigger; status changes use `role="status"`.
- Tests: Vitest render/unit tests for new pure logic and components; update the Playwright specs
  that assert on moved controls (`company-applications`, `company-timeline`, `workspace`,
  `applications`, `mail-triage` as needed). Browser tests use `jobops_e2e` only.
- Verify in Docker: `docker compose up -d --build app` from the repo root, check
  http://127.0.0.1:3210. Never commit `jobops/data/`.

## Approaches considered

- **Restyle and recompose in place (chosen).** Keep the readers (`readCompanyApplications`,
  `suggestHandling`, the timeline readers) and every server action; rebuild the header, row, row
  body, new-mail tray and rules line as presentation over the same data. Lowest risk of losing
  behaviour the last branch fixed.
- **Rewrite the page as new components.** Cleaner file layout, but re-implements save/link/outcome
  wiring that took several fix rounds to get right. Rejected.
- **Styling-only pass.** Cheapest, but cannot fix the duplicated chooser, the overlap's structure or
  the header's information model. Rejected.

The visual direction was chosen from a live gallery (2026-11-17): header **C**, rows **A**, open
application **A**, mail rules **A**, new mail **A**. Reference file (not committed):
`.superpowers/brainstorm/56589-1794879888/content/company-page.html`.

## Design

### 1. Header — title plus stat strip

```
‹ All companies
[SN] ServiceNow                                        [✉ Company mail] [Record application] [⋯]
     Enterprise workflows & AI · Bengaluru, Hyderabad · hybrid
┌─────────────┬──────────────────────┬──────────────────┬─────────────────────────────┐
│ Status      │ Applications         │ Last activity    │ Next                        │
│ ● Interview │ 2  1 active · 1 closed│ 16 Nov  Round    │ ⚠ Record the DSA result  overdue │
└─────────────┴──────────────────────┴──────────────────┴─────────────────────────────┘
```

- Identity: monogram, name, one meta line = focus · cities · work modes (each part omitted when
  missing). The separate focus paragraph goes away.
- Actions: **Company mail** (outline), the primary next action (unchanged: "Record application" or
  "Save an opening"), and a **⋯ menu** with: Open careers site (when `careersUrl`), Add previous
  job, Mail search settings.
  - *Add previous job* opens the existing `PreviousJobForm` in a dialog.
  - *Mail search settings* switches to the Applications tab if needed, scrolls to the rules line
    and opens its editor.
- Stat strip, four cells (2×2 below the container's `@2xl`):
  - **Status**: exactly one pill. Use the company status pill when its tone is not `none`,
    otherwise the stage chip. The previous-employer badge, when present, sits under the pill.
  - **Applications**: total, with "N active · M closed".
  - **Last activity**: date of the newest entry at or before now across all rows' `days` and the
    company's unplaced mail (tray and folded section), with a short label of its kind (Recorded,
    Round, Email, …). Future entries (a booked round) never count. "No activity yet" when empty.
  - **Next**: `next.text` (truncated with a title tooltip) and `next.due.label`; the cell uses the
    warning tone when `due.tone` is `late`, the link tone for `now`. "Nothing due" when no next.
- The minimal page for unlisted companies (`MinimalCompanyPage`) uses the same header without the
  research-only parts.

### 2. Application rows (closed) — cards with a progress bar

```
▌ Sr Software Engineer                               ▬ ▬ ▬ ◉ ▭    [Round 1 · DSA]   ›
▌ Applied 4 Nov 2026 · No requisition · Hyderabad, hybrid          Result due 16 Nov
```

- A 4 px left rail coloured by the current step's tone (interviewing = review yellow, applied =
  primary, offer = teal, bad = danger, muted = border).
- Line 1: role (semibold). Line 2: "Applied <date>" (or "Not sent") · requisition or
  "No requisition" · city.
- Right side: a segmented progress bar with one segment per named step (done, current, stopped,
  future), then the state pill (`step.label`) with `step.detail` as small text under it.
- **New-mail badge**: when the row's timeline holds mail with `attention: "open"`, show
  "N new" next to the pill.
- Keeps today's behaviour: hash open, scroll, ring highlight, several rows open at once, closed
  row renders no body.
- Fix the overlap structurally: the list, the tray and the rules line are separate blocks with
  at least 32 px between them; an e2e assertion checks the gap.

### 3. An open application — workspace with a details sidebar

Two columns when the row's container is at least `@3xl` (main + 290 px aside); stacked below,
aside first collapsed into a compact facts row.

**Main column, top to bottom:**

1. **Current-step box** (only when there is something to act on):
   - A booked `SCHEDULED` round: "<Round name> was on <date>" (or "is on <date>" when in the
     future) with the outcome buttons for that round. **These buttons move here from the round
     card**; the round card in the timeline keeps its status, questions, notes and Edit round, but
     no longer renders `OutcomeChips`.
   - `Preparing`: "Not sent yet" with `PreparingControl` (record sent), Not applying, and for
     outreach records the "Open outreach prompt" / "Record a direct application" links.
   - Closed as not applying: the Reopen button.
2. **Tracker**: `NamedSteps` with "+ Add step" (unchanged behaviour), then the "From this email"
   block and its link-only button when a source email is present.
3. **Recorded from an email: <outcome> · Undo** as a small inline notice under the tracker.
4. **Activity toolbar**: the timeline filter restyled as a segmented control (All · Stages ·
   Mail), and on the right the follow-up chip (`OutcomeChips` with `followup`) when available.
5. **Note composer**: one rounded line, "Add a note to this application's history…", with an Add
   button; same `addApplicationNote` action, `maxLength` 20000. It grows to a textarea when the
   text wraps or on Shift+Enter; Enter submits.
6. **Timeline** (`CompanyTimeline`, unchanged features: unlink, older link, round cards, mail
   dialog), with a **New** dot on mail entries whose `attention` is `open`.

**Aside:**

- **Details** card with icon rows: Opening (job link with requisition), Applied (date · method),
  Follow-up (the `FollowUp` control), Application page (link, or "Add link" which opens
  `EditDetails`), and an Edit details action.
- **Résumé used**: a file chip (`ResumePreview`) and the three score values in compact tiles
  (from `row.scores`; omitted when null).
- **Notes**: section names from the notes template and an "Open notes" button that opens the
  existing `NotesFold` content in a dialog (view and edit as today).

### 4. Mail-search rules — one summary line

At the bottom of the Applications tab:

```
[🔍] Mail search · last run 16 Nov, nothing new           [✎ Edit] [Search now]
     careers.servicenow.com  ServiceNow  ServiceNow India  Service Now  3 inboxes
```

- Summary from `data.search`: last-search result, domains, addresses and keywords as tags, the
  inbox count.
- **Search now** expands the editor and starts the existing search exactly as its own button
  does today (same inboxes, time frame, paging loop, progress and results), so no search logic
  moves out of `RulePanel`.
- **Edit** expands the full existing `RulePanel` in place (all of today's fields and the
  "exact search" disclosure). The ⋯ menu's "Mail search settings" links to
  `?tab=applications#mail-search`; the rules line opens its editor when the hash is
  `#mail-search` (on load and on `hashchange`).

### 5. New mail — "needs a role" tray

At the top of the Applications tab, above the rows, when the company has unplaced mail with
`attention: "open"`:

```
● 3 new emails need a role · arrived 16 Nov, 9:39 pm              [Mark all just info]
● ✉ Thank you for applying to Amazon  [Application]                     [Choose role ▾]
     Role in the email: Software Dev Engineer II, 3P Pricing · noreply@mail.amazon.jobs
```

- Heading: count and newest arrival time. Wording "need a role" when two or more applications are
  open, otherwise "need a look".
- One line per email: New dot, tag icon and chip, subject (opens the mail dialog), second line =
  the role hint when matched, else sender and the cleaned preview.
- **Choose role ▾** menu: open applications, matched ones first with a "match" badge, then
  "Just info, no application" and "Place at a date…" (existing `PlaceAt`).
- **Picking a role only selects it** (nothing is recorded by the menu, so a misclick is visible).
  The line then shows the chosen role and the existing handling bar for that role:
  - when the email's suggested outcome is allowed for that application, today's primary
    "Record <outcome>" button (opening the round/deadline fields form for `scheduled` and `oa`
    exactly as today), with "Something else" and Just info beside it;
  - otherwise a primary **Link to this application** button (`linkMailOnly`, returning to the
    company page), with Just info beside it. Acknowledgements land here, since
    `APPLICATION_ACKNOWLEDGEMENT` suggests no outcome.
  - A "Change" control reopens the menu.
- **Mark all just info** applies the existing just-info action to every email in the tray, in
  one server action. Each stays undoable from "Other company mail".
- The tray reads open unplaced mail for the company on its own query (`attention: "open"`,
  first 50, newest first) with "and N more" linking to `/mail` filtered to the company.
- A `?mail=<id>` link to an open unplaced email opens that email's dialog from the tray, as the
  unplaced timeline does today.
- Handled unplaced mail moves into a folded **Other company mail · N** section between the rows
  and the rules line, holding today's unplaced timeline and its own pagination. It reads only
  handled mail: `listMail` gains `attention: "handled"` (attention state `DONE`), so no email
  appears in both the tray and the fold. The fold opens itself when a `?mail=` link targets one
  of its emails.

**Role match** (new pure function, unit-tested):

- `Handling.applications[]` gains `requisition: string | null`.
- An application matches an email when its requisition appears in the subject or text as a whole
  token, or, failing that, when its exact role title (case- and whitespace-normalised) appears.
- Every matching application gets the badge; nothing is preselected or linked automatically.

### 6. Clean email previews

`previewLine` (in `src/features/mail/row-text.ts`) drops URLs before choosing the line:
`http(s)://…`, `<https://…>`, and `[label]<url>` becomes `label`. A line that is only links is
skipped. This applies everywhere `previewLine` is used (company timeline, mobile attention feed).

## Control inventory (must survive)

Header: All companies, Company mail, Record application / Save an opening, Open careers site,
Add previous job, mail search settings.
Per application: Set follow-up, follow-up outcome chip, Notes (view/edit), Application page and
Edit details, tracker with + Add step and its outcome panel, From this email + Link without
recording an outcome, Open outreach prompt, Record a direct application, Record sent, Not
applying, Reopen, Recorded from an email + Undo, Add to history, timeline filter, Older activity,
email Unlink, round card Edit round / questions / notes, round outcome buttons (moved).
Company mail: every unplaced email's handling (role, outcome, Just info, Place at, Save as
opening), unplaced pagination, the full rule editor and search, action notices (`notice`).

## Decided in conversation

- Visual picks: header C, rows A, open application A, rules A, new mail A.
- Round outcome buttons live only in the current-step box.
- Add the requisition/role-title match as a hint in the role picker.

## Calls made by Claude (correct me)

- "New" means `attention: "open"`.
- Role pick selects then confirms; with no allowed outcome the confirm is "Link to this
  application".
- "Search now" opens the editor and starts the existing search.
- The fold holds handled mail only, via a new `handled` attention filter.
- Last activity ignores future entries and includes unplaced mail.
- Handled unplaced mail goes into a folded "Other company mail" section.
- URL stripping applies to every preview, not only the tray.
- Last activity comes from the newest entry across rows.
- Open careers site moves into the ⋯ menu.
- Notes open in a dialog from the aside rather than expanding inline.
- Tray cap of 50 with a link to `/mail`.

## Left to the builder

- Component file split and names, within `src/features/companies/views/` and
  `src/features/timeline/`.
- Exact spacing, the segment widths and hover motion, following the gallery file.
- The short kind labels for "Last activity".
- How the dialogs are built, reusing the existing dialog pattern (`ResumePreview`, mail dialog).
