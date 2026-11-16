# Track each application on its company page

Date: 2026-11-16. Status: ready for approval.
Mockups (visual companion): `company-page-v8.html` (company page, today beside the proposal),
`notes-and-fallback-v9.html` (Notes fold, Edit details, a company without a page) and
`notes-format-v11.html` (readable notes). Follows [interview notes and progress](2026-11-16-interview-notes-and-progress-design.md),
whose build put the picks on `/applications/<id>`, a page nothing links to.

## Why

The user tracks applications from the company page and from Mail. After the first build they
still could not see where each application stood: the company page listed two identical
"Sr Software Engineer" links, mixed both applications into one timeline, and showed no rounds or
questions. The Applications row and every "View application" link opened an older in-place view,
and the redesigned application page was only reachable from "Edit details". The tracker also
predicted rounds from company research ("Managerial round · Expected"), which the user does not
want: it must show only what happened.

## Goals

1. On a company page, each application is one row: **date applied · requisition · where it
   stands**. Clicking it opens that application in place.
2. An open application shows four facts (Opening, Applied on, Résumé used, Where it stands), a
   tracker of what happened, and that application's own timeline.
3. The tracker never predicts. Its steps are Applied, Acknowledged, then for each round
   **Interview scheduled** and **Round N · Kind**, then **Offer / Rejected**. Rounds are added as
   they happen, by the user or by Claude Code or Codex through the API.
4. The application's timeline is today's company-timeline card style, newest first: emails,
   recorded entries and a new **Round** card that opens in place to its questions, notes and
   result.
5. Every link to an application (Mail, Applications rows, "View application", search) lands on
   the company page with that application open and highlighted.

## Non-goals

- No "Move" control on the page. A misplaced email is fixed by Claude Code or Codex through the
  existing `link` / `unlink` mail actions.
- No predicted or expected rounds anywhere, including Applications list rows.
- No change to the question library (`/applications/questions`) or to the mail popup.
- No change to how outreach records (Sent → Replied → Referred) are tracked.

## Anti-goals (a failure even if it works)

- A step shown that did not happen.
- Two applications at one company that cannot be told apart at a glance.
- An entry on one application's timeline that belongs to another.
- An email that expands inline instead of opening the popup.
- A card without a time.
- A submitted application's résumé reference changed or hidden.

## Approaches considered

| Approach                                                                                        | Trade-off                                                                               | Decision             |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------- |
| A. Application rows on the company page, opening in place; `/applications/<id>` redirects there | One place per application, matching how the user navigates; the company page grows      | **Chosen**           |
| B. Keep `/applications/<id>` and link every entry point to it                                   | Smallest change; the user would still leave the company context to track an application | Rejected by the user |
| C. Company page shows facts and tracker; timeline and questions stay on `/applications/<id>`    | Two places to look for one application                                                  | Rejected             |

## Design

### Company page

The first tab becomes **Applications · N** (default), followed by Compensation, Interview loop
and About & sources. The separate company-wide Timeline tab is removed; every entry lives under
its application or in the company-only section below.

- **Application row** (collapsed): caret, date applied ("4 Nov 2026"), requisition
  ("JB0076231"; "No requisition" when none is saved, never guessed), role and city, and a state
  pill with the current step ("Round 1 · DSA · Result due", "Acknowledged"). Rows are ordered by
  date applied, newest first. Outreach and not-yet-sent records use the same row, with "Not
  sent" or the outreach state.
- **Open state**: the newest active application opens by default; any other opens from a deep
  link (below). Several may be open at once.
- **Facts**: Opening (requisition with posting link, location) · Applied on (date and method) ·
  Résumé used (version label and filename; clicking opens a preview popup of the exact submitted
  PDF, with Download) · Where it stands (current step and its detail, such as "Result due ·
  16 Nov").
- **Notes fold and Edit details** (between the facts and the tracker): see Notes. On the next
  line, "Application page" with its link (or "not saved") and an **Edit details** link that opens
  a popup with the application page URL and the résumé (pickable only before the application is
  sent; shown locked after).
- **Tracker** (below the facts): see Steps. Clicking a reached step scrolls to its timeline card,
  highlights it, and opens it if it is a round.
- **Timeline** (below the tracker): see Timeline.
- **ServiceNow, not on an application**: a section after the rows holding company mail and
  entries not linked to any application, newest first, in the same card style. Hidden when empty.

### Steps (the tracker)

Derived only from recorded data:

1. **Applied** (sentAt), **Acknowledged** (acknowledgement evidence, as today).
2. For each round in position order, skipping cancelled rounds:
   - **Interview scheduled**, at the `INTERVIEW_SCHEDULED` event whose payload carries that
     round's id (falling back to the round's creation time), detail "for 16 Nov";
   - **Round N · Kind**, at the round's scheduled time, numbered among technical rounds as
     today ("Round 1 · DSA", "Managerial round", "HR round"); state from the outcome: scheduled
     (current, "Booked …" or "Result due"), passed (done), failed (stops as Rejected).
3. **Offer / Rejected** as one final step until one happens, then whichever it was (Offer,
   Accepted, Declined, Rejected, Withdrew, Closed).
4. **+ Add step** sits before the final step on open applications and holds every outcome that
   adds a step: **Interview scheduled** (the existing round-scheduled form: kind, date, time,
   interviewer, note), **OA received**, **Offer**, **Rejected**, **Withdrew** and **No reply,
   close it**. Follow-ups ("Sent a follow-up", "Set a follow-up") are two small buttons beside
   the facts. A round's result (cleared, didn't clear, rescheduled) is recorded on its Round
   card. An unsent application shows **Record as sent** and **Not applying** in place of
   - Add step.

Company research `typicalLoop` is no longer used for steps. Applications list rows use the same
steps at row size.

### Timeline (per application)

The existing company-timeline component, filtered to one application (`application=<id>`,
already supported), newest first, grouped by day with the day column ("Today 16 Nov",
"Fri 13 Nov").

- **Email card**: kind pill with time and inbox; sender name (with "HR" or other role when
  known) and address; bold subject and preview; requisition tag on the right. Click opens the
  mail popup, as today.
- **Recorded card**: one pill, "✎ Recorded", with the time under it; the text with the role in
  grey; requisition tag. Click expands the clamped text to full.
- **Round card** (new): "◆ Round" pill with the time; interviewer name; "Round 1 · DSA" with
  "3 questions" and a short summary; result pill ("Result due", "Cleared", "Didn't clear") and
  requisition tag. Click opens it in place to tabs **Questions · N** (rows that open in place,
  Expand all, Add a question, as built) and **Round notes** (Markdown), with the round actions
  Cleared the round, Didn't clear it, Rescheduled, Edit round. Every round appears, past or
  upcoming, at its scheduled time, else its creation time.
- **Times**: every card shows a time. A time that is exactly midnight India time is a date
  saved without a time and is shown and sorted as **12:00 pm**.
- **Filters**: All · Stages · Mail.
- Every card carries the company and the application's requisition (or "No requisition") so an
  agent or the user can see where it is filed.

### Notes

Closed by default as one line showing the note's section names (for a structured note) or its
first line (for a free note). Opened, the note reads top to bottom with no boxes:

1. **Summary**: one or two sentences, rendered at a larger size, with key values (date, portal,
   requisition) emphasised.
2. **Résumé scores**: the Résumés page dials (`Ring` from `features/resumes/fit/dials.tsx`,
   reused, not copied) for Keyword check, ResumeNext and ATS optimizer, read from the scores
   stored for the exact submitted résumé version against this application's saved job, with the
   master's score as the tick and the change beside it, and **Open in Résumés**. Hidden when no
   scores are stored. Never parsed from note text.
3. **On the form**: a checklist (Markdown task list) with ✓ and ✕ marks.
4. **Proof**: long identifiers (hashes, UUIDs) middle-truncated with Copy and the full value on
   hover; local file paths shown as their last segment with Copy.

Agents write notes from a Markdown template with headings `## Summary`, `## On the form` and
`## Proof`. The page styles that structure; any other Markdown still renders normally. The
template goes in the job-apply skill reference and the API docs. Edit notes opens the existing
split editor.

### Links and routes

- `/companies/<slug>#application-<id>` opens that row, scrolls to it and highlights it.
- `/applications/<id>` redirects there. Its `?mail=` deep link becomes
  `/companies/<slug>?mail=<mailId>#application-<id>`, opening the email popup over the page.
- Applications list rows, "View application", Mail's application links, the mail popup and
  search all use this link. The in-place expansion on `/applications` is removed; rows link.
- The question library's "open in context" links go to the round card
  (`#round-<roundId>` inside the application).

### Data and API

- `application_rounds.interviewer` (text, default empty, ≤ 200 characters): new. Set by the
  round-scheduled form, Edit round, and the transition API's round details
  (`detail.interviewer`). Existing rounds stay empty until edited.
- `PUT /api/v1/applications/{id}/notes` (new, LAN-trusted like the other agent routes): body
  `{ "notes": "<markdown>" }`, at most 100 000 characters, replaces the application's notes and
  returns the saved text. Agents use it to write template notes; there is no notes write route
  today.
- No change to how mail is linked; `link` / `unlink` stay the way to fix placement.
- No change to stored times; the 12:00 pm rule is display and sort only.

### Removed

- The in-place expanded row on `/applications` and its duplicate record buttons.
- The standalone `/applications/<id>` page (now a redirect) and its header switcher, rail and
  page-level Rounds list; their content moves into the company-page row.
- Expected rounds and `EXPECTED_DETAIL`.
- The company page's "Your applications" aside, role filter chips and "Practise questions"
  button (the Interview loop tab keeps research).

## Constraints

- Docker-only runtime; browser tests use `jobops_e2e`, never personal data.
- Keep the built question editor, library, mail popup and agent question API unchanged.
- Text truncates with a full-text title; no horizontal page scroll at 390px; rows stack on a
  phone with the facts in two columns.
- Documentation maintenance rule (AGENTS.md) applies: API docs for `detail.interviewer`, the
  README walkthrough and diagram 07, and the job-apply skill reference.

## Decisions made by Claude (please check)

- The newest active application opens by default; others stay closed until clicked or linked.
- Round cards sit at the round's scheduled time, so an upcoming round appears at the top.
- The 12:00 pm rule applies to any timestamp at exactly 00:00 India time.
- `interviewer` is a new round field rather than reusing the round name.
- `/applications/<id>` becomes a redirect rather than being deleted, so old links keep working.
- A notes write route is added so agents can write template notes (none exists today).
- A reschedule updates the Interview scheduled step's detail ("moved to 18 Nov") and the round
  card's time; it does not add a step. The Recorded card for the reschedule stays in the timeline.
- For an online assessment, the step before the round reads "OA received" instead of
  "Interview scheduled", matching how an OA is recorded today.

## Settled with the user

- "What happened?" outcomes live in **+ Add step**; follow-ups beside the facts; round results
  on the Round card (see Steps).
- Notes and Edit details sit under the facts as drawn, with the readable notes design.
- Existing application notes are rewritten into the template after the build (below).

### Settled: companies without a company page

About 3 of 28 applications (DoorDash, Level AI, APEXX Global) are at companies with no company
record, so `/companies/<slug>` does not exist for them. They get a minimal company page for any
company key: the Applications tab only (rows, facts, Notes, tracker, timeline), a banner "Not in
your Companies list yet" with **Add company**, and the research tabs greyed until the company is
added.

## Data follow-through after the build

Claude Code rewrites each existing application note into `## Summary`, `## On the form` and
`## Proof` through the new notes route, keeping every fact and dropping nothing. It shows the
user two rewritten notes (ServiceNow JB0076231 and DoorDash P-111609) before doing the rest, and
keeps a copy of every original note under ignored `jobops/data/` until the user confirms.

## Left to the builder

Component boundaries, how the company page loads several applications' timelines (one read per
open row or one company read split by application), exact breakpoints, and test layout.
