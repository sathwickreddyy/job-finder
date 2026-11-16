# Interview notes, named rounds and mail reader

Date: 2026-11-16. Status: approved and built (gallery removed after the build).
Gallery: `/gallery/interview-notes` (picks: stage A named steps, header B facts and a switcher,
questions A rows that open in place, editor A side by side, library B sortable table, page A two
columns). Mail reader requested in conversation on the same day.

## Why

After the ServiceNow round 1 (DSA, 16 Nov) the user could not tell, per application, what was
happening or which résumé had been sent, and had nowhere to keep formatted notes. They want to
record every interview question and how they answered it so they can revisit it before later
rounds. Two ServiceNow "Sr Software Engineer" applications with different résumés made the gap
obvious: the list showed only "Interviewing", and nothing on screen separated the two openings.

## Goals

1. Show where each application stands as named steps: Applied, Acknowledged, Round 1 · DSA,
   Round 2 · LLD, Managerial round, HR round, Offer. Rounds still to come, taken from company
   research, are visibly marked expected.
2. Make each application identifiable at a glance: requisition, applied date, résumé sent and
   current step, with a switcher between applications at the same company.
3. Record each interview question with the problem as asked, the user's own answer, how it went,
   time and space complexity, the interviewer's reaction and an optional review written later by
   Claude Code or Codex. Notes are Markdown with highlighted code and tables.
4. One question library across all companies, sortable and searchable, to revise before the next
   interview.
5. Every email, everywhere it appears, opens in a focused reading popup instead of expanding inline.
6. Agents can read and write questions and reviews through the local API.

## Non-goals

- No LLM calls inside JobOps. Reviews are written by the user's agent through the API.
- No question generation, scoring of answers, or interview scheduling.
- Outreach journeys (Sent → Replied → Referred) keep their current steps.

## Anti-goals (would be a failure even if it works)

- An expected round shown as booked or completed.
- A submitted application's résumé reference changed or hidden.
- Existing round or application notes lost or altered by the migration.
- Mail that still expands in place, or a popup that loses the handling actions available today.
- Text that overflows its column, scroll areas that trap the page scroll, or sections that cannot
  be collapsed. (The gallery fixed all four; the build must keep those behaviours.)

## Approaches considered

Data shape for questions (the UI direction came from the gallery picks above):

| Approach | Trade-off | Decision |
| --- | --- | --- |
| A. `interview_questions` table, one row per question, under its round | New table and routes; supports the library's sort, filter and search and per-question agent writes | **Chosen** |
| B. One Markdown document per round in `application_rounds.notes` | No schema change, but the library would have to parse free text and agents would overwrite whole documents | Rejected |
| C. JSON array column on `application_rounds` | Single write per round; awkward to query across companies and to update one question safely | Rejected |

Mail reader: a shared modal dialog with deep links was the only approach that meets "always open
a popup and focus on that mail". A side drawer was rejected because it keeps the list in view.

## Design

### Data

New enum `question_outcome`: `SOLVED_CODE` (Solved in code), `SOLVED_ALOUD` (Solved, finished
aloud), `PARTIAL` (Partly solved), `STUCK` (Got stuck).

New table `interview_questions`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `round_id` | uuid, not null, FK `application_rounds.id` on delete cascade | |
| `position` | integer ≥ 1 | order within the round |
| `title` | text, not null, 1–200 chars | |
| `patterns` | jsonb string[] | user tags such as Sliding window; trimmed, de-duplicated, ≤ 8 |
| `prompt` | text, default '' | Markdown: the problem as asked |
| `answer` | text, default '' | Markdown: the user's own working, kept as written |
| `outcome` | `question_outcome`, nullable | null = not recorded |
| `time_complexity`, `space_complexity` | text, default '' | free text, e.g. O(n) |
| `interviewer` | text, default '' | Markdown: what the interviewer said |
| `review` | text, default '' | Markdown, written by an agent |
| `review_source` | text, nullable | e.g. "Claude Code", required when `review` is non-empty |
| `reviewed_at` | timestamptz, nullable | |
| `created_at`, `updated_at` | timestamptz | |

Indexes on `(round_id, position)` and `updated_at`. Each text field is capped at 100 000
characters.

Round kinds gain `HR`. Kinds keep their stored values; only labels change (below).

`applications.notes` and `application_rounds.notes` are rendered as Markdown from now on. Existing
plain-text notes render unchanged except that Markdown syntax in them takes effect; no data is
rewritten.

### Named steps (stage A)

Derived in `journey.ts` for applications (outreach unchanged):

1. **Applied**, then **Acknowledged**, with the same evidence rules as today.
2. One step per recorded round in `position` order, skipping cancelled rounds. Labels: technical
   kinds (OA, DSA, LLD, HLD, Domain, Other) are numbered among themselves, as in
   "Round 1 · DSA" and "Round 2 · LLD". `HIRING_MANAGER` is "Managerial round", `HR` is
   "HR round" and `BEHAVIORAL` is "Behavioural round". The round's own name appears as detail
   when it differs from the kind label. State comes from the outcome: `PASSED` reached; `FAILED`
   stops the journey as a rejection; `SCHEDULED` is current, with detail "Booked 20 Nov, 3:00 pm"
   before the time and "Result due" after it.
3. **Expected rounds**: once at least one round is recorded, the company's research
   `typicalLoop` after the recorded count, labelled the same way and marked
   "Expected · from company research". Never shown before the first round, never counted as
   reached. Without research, no expected steps appear.
4. **Offer**.

Closing keeps today's semantics: a rejection replaces the first step not reached, later steps
fade, and other closes are muted.

The named stepper replaces the four-step track on Applications list rows and on the application
page. It scrolls sideways when narrow, fades only the hidden edge and centres the current step
by scrolling only itself.

### Application page (page A, header B, questions A, editor A)

`/applications/<id>` becomes two columns once its content area is at least about 830px wide. The
right rail is 300px, sticky, and scrolls on its own. Below that width the rail stacks under the
main column.

- **Header (B)**: company and role. When the same company (by the record's resolved company key) has more than one
  application, a switcher shows each one's requisition and step and navigates between them. Four facts follow:
  - **Opening**: requisition with a posting link, location.
  - **Applied**: date and method.
  - **Résumé sent**: version label and filename (middle-truncated), opening
    `/resumes?file=<id>`.
  - **Where it stands**: the current named step.
- **Requisition**: `jobs.external_id`. When it is missing, show "No requisition saved" and the
  posting link. Never guess one from a filename.
- **Main column**: named steps; the existing What happened? outcomes and follow-up; Rounds, each
  with its questions; Notes.
- **Questions (A)**: per round, a heading ("Round 1 · DSA · 16 Nov, 12:00 pm · Result due") with
  Expand all. One row per question shows the title, patterns, how it went and T/S complexity.
  It opens in place to show What they asked, How I answered, Interviewer and the review, which
  is labelled with its source. Add a question sits under each round; new questions append at the next position.
- **Question editor (A)**: title, how-it-went segmented control, time and space inputs, and
  pattern chips with an add field. Below them, a section switcher (What they asked / How I
  answered / Interviewer) over one side-by-side Markdown editor and preview, stacked when narrow.
  Save is explicit (button or ⌘S). Leaving with unsaved changes asks first. Delete asks for
  confirmation. The review field is read-only in the UI.
- **Notes**: the application's notes use the same editor, behind an Edit button.
- **Right rail**: Résumé sent, Mail (popup), History, Linked records, and Edit details (the
  existing form, folded by default).
- **Text and scrolling**: every row truncates with `min-w-0` and a full-text title. Inner scroll
  areas never use `overscroll-contain`, except inside dialogs, so the page keeps scrolling.

### Question library (B)

`/applications/questions`, reached from a Question library button on Applications and from each
round heading.

- **Columns**: Question, Pattern, How it went, Company with round, Date. All sortable; newest
  first by default.
- **Filtering**: search across title, company, round and patterns; filter chips for how it went
  and pattern.
- **Narrow screens**: the table keeps a minimum width and scrolls sideways with an edge fade.
- **Reading**: clicking a question opens a side sheet dialog with focus trap, Esc to close and
  focus return. It shows the full question, plus Open application and Edit links.
- **Empty state**: "Questions you record after interviews appear here."

### Mail reader popup

One `MailDialog` used wherever a mail row appears: the Mail timeline and its coming-up strip,
company timelines, the Applications in-row expansion and the application page's Mail card. Rows
stay one line and open the dialog; nothing expands inline any more. On phones the dialog fills
the screen.

- **Header**: subject, sender, inbox, date and the tag pill with its existing edit-tag control.
- **Body**: `body_text`, falling back to the snippet, with line breaks preserved and URLs
  linked (`rel="noreferrer"`, new tab). HTML is never rendered. All stored mail has text bodies
  today.
- **Footer**: the existing handling actions for that email (suggested action, Just info,
  Something else, link or unlink, Undo where shown today).
- **Navigation**: previous and next arrows step through the list the dialog was opened from.
- **Behaviour**: Esc and the scrim close it, focus returns to the row, and the background does
  not scroll.
- **Deep links**: `?mail=<id>` opens the dialog over the page that carries it. This replaces
  today's start-open expansion; existing redirects into the timeline keep working.
- **Loading**: the body loads when the dialog opens, through a server action or
  `GET /api/v1/mail/{id}`, and shows a skeleton while loading.

### Agent API (LAN-trusted, like the other `/api/v1` routes)

| Method and path | Use |
| --- | --- |
| `GET /api/v1/applications/{id}/questions` | Rounds in order with their questions |
| `POST /api/v1/applications/{id}/rounds/{roundId}/questions` | Append one or more questions; returns ids |
| `PATCH /api/v1/questions/{id}` | Update fields, including `review` + `reviewSource` |
| `GET /api/v1/questions` | Library: `q`, `company`, `pattern`, `outcome`, `limit`, `cursor` |

Deletion stays in the UI. Validation uses zod; `404` for unknown ids, `400` with field errors,
`409` when the round does not belong to the application. Outcome values in the API are lowercase
(`solved_code`, `solved_aloud`, `partial`, `stuck`).

### Data follow-through after the build

- Record the three ServiceNow round 1 questions from the user's saved notes
  (`jobops/data/interview-notes/2026-11-16-servicenow-round-1-dsa.md`) through the new API. Keep
  the user's working as written and add the reviews already drafted in the gallery fixture,
  labelled Claude Code.
- Set the interviewing ServiceNow opening's requisition only after reading it from the live
  posting; its résumé filename alone is not evidence.

## Constraints

- Docker-only runtime. Drizzle migration plus a schema test. Integration tests use `jobops_e2e`
  only.
- Theme tokens only, light and dark. Reduced motion respected. Keyboard and screen reader access
  for steppers, expanders, editors and dialogs.
- Markdown rendering escapes HTML (no `rehype-raw`).
- Remove the gallery once built and record the picks in `AGENTS.md`, as with earlier galleries.
- Update the README walkthrough, the API automation guide with a new contract doc, and the
  job-apply skill reference for recording interview questions.

## Decisions made by Claude (please check)

- Questions live in their own table (approach A).
- `HR` added as a round kind; Behavioural shown as "Behavioural round".
- Expected rounds appear only after the first recorded round.
- The question editor uses one side-by-side pane with a section switcher, not three stacked panes.
- Explicit Save instead of autosave, with an unsaved-changes guard.
- Library lives at `/applications/questions` rather than in the main navigation.
- The review is agent-written and read-only in the UI.

## Left to the builder

Component boundaries, server action versus route for the mail body, exact breakpoints within the
stated limits, and test file layout.
