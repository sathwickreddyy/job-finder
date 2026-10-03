# Applications as company lanes on one calendar

Date: 2026-10-03 · Status: design approved; implementation not started
Gallery: `/gallery/applications/timeline` (picks: Landing view B "Calendar lanes", Emails C
"Button with a drawer")
Supersedes §1.1, §1.3 and the Next/Records/Emails tab parts of
`2026-10-03-applications-redesign-design.md`. That spec's data model (§2), outcomes (§3), mail
providers and refresh (§4.1–§4.3), queue rules (§5) and errors (§8) stay in force unchanged.

## Goal

Opening Applications should show, for every company, what happened in order, where it stands and
the one thing to do next, all at once. The tabbed page split that across Next, Records and Emails.
It also opened on an empty box when nothing was due, and showed raw setup variables when no
inbox was connected.

After this change `/applications` is one page: a calendar with one lane per company, a Today line,
a derived status per lane and the next step beside it. Mail about a company appears on its lane.
Mail that belongs to no company lives in a drawer behind an **Emails** button.

Nothing is invented. Every dot, label and date comes from recorded events, rounds, follow-up
dates or mail. No AI model is called, nothing is sent, and there are no database changes.

## 1. Page

`/applications` (server component, `dynamic = "force-dynamic"`):

- **Header**: title "Applications"; actions **Record an application** (`/applications/new`) and
  **Emails** with a count badge (§4). The badge is hidden when the count is 0. With no inbox
  connected the button reads **Connect inboxes**.
- **Readout line**: "Hover a dot to read it. Select a company to open its whole timeline." It is
  replaced by the hovered or focused dot's text (§2.6).
- **Lanes chart** (§2), then a collapsed **Closed · N** toggle that reveals closed lanes in the
  same chart.
- **Empty state** (no records): "No applications yet" with **Find openings** and **Record an
  application**.

Query parameters:

| Param             | Meaning                                                                         |
| ----------------- | ------------------------------------------------------------------------------- |
| `open=<laneKey>`  | Expands that lane (§2.7). Kept across server-action revalidation.               |
| `role=<recordId>` | Selected role inside an expanded lane with several records.                     |
| `mail=<mailId>`   | With `open`: the matched mail being linked (§3).                                |
| `outcome=<id>`    | With `open`: preselected outcome chip (validated against availability).         |
| `emails=1`        | Opens the Emails drawer.                                                        |
| `notice=<text>`   | Shown at the top of the drawer (OAuth callback and triage results), ≤300 chars. |

Legacy links: `?tab=emails` → `?emails=1`; any other `tab`, `filter`, `view` or `q` is ignored
and the plain page renders.

## 2. Lanes

### 2.1 Grouping

One lane per company. Records are grouped by a company key: the normalized name (trimmed,
lower-cased, single spaces), mapped through active company records' names and aliases so
"Microsoft India" joins "Microsoft" when it is a listed alias. The lane's display name is the
company record's name when matched, else the most recent record's company text.

All records for the company join the lane: direct applications, referral asks, cold emails and
LinkedIn messages, for any role.

### 2.2 Lead record and status

The **lead** record is the furthest-along open record: phase rank Decision > Interviewing >
Applied > Preparing; ties go to the latest activity. When every record is closed, the lead is the
most recently closed one.

The status label comes from the lead (silence clock and thresholds per `queue.ts`):

| Lead state                                | Label                                                           | Tone           |
| ----------------------------------------- | --------------------------------------------------------------- | -------------- |
| Preparing                                 | Not sent yet                                                    | preparing      |
| Applied (direct), clock below threshold   | Applied · today / yesterday / N days                            | applied        |
| Applied (outreach), clock below threshold | <Method> · N of T days ("Referral ask · 3 of 5 days")           | applied        |
| Applied, clock at or past threshold       | Quiet for N days / <Method> · N days quiet                      | quiet          |
| Interviewing                              | Interviewing · round N[ of M]                                   | interviewing   |
| Decision                                  | Offer · decide by <follow-up d MMM>, else "Offer received"      | offer          |
| Closed REJECTED                           | Rejected after <last settled round kind label>, else "Rejected" | closed         |
| Closed NO_REPLY / WITHDREW                | Closed, no reply / Withdrew                                     | closed         |
| Closed ACCEPTED / DECLINED                | Accepted the offer / Declined the offer                         | offer / closed |

- N for Interviewing is the count of the lead's non-cancelled rounds; "of M" appears only when
  company research gives `typicalRounds` and M ≥ N.
- An Applied lead with matched, unhandled mail on the lane gets the suffix " · new email".
- Two or more open records add " · +K role(s)", where K is the other open records.

Tones map to theme tokens only: interviewing `bg-selected`, offer `bg-success-soft`, others
neutral `bg-muted` with a coloured dot (quiet `bg-review`, closed `bg-destructive`), preparing a
dashed outline. No tinted panels for urgency; colour lives in dots, text and buttons.

### 2.3 Dots

Each dot is `{ at, tone, label, detail?, recordId, role?, via?, mailId? }`, drawn from:

| Source                                                                                                                                                                                                                                                                                                                                                                                  | Tone                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Application events: `historyTone` good/bad; `APPLICATION_SENT`, `APPLICATION_SUBMITTED`, `OUTREACH_SENT`, `FOLLOW_UP_SENT` → sent; inbound replies and scheduling events (`REPLY_RECEIVED`, `ASSESSMENT_RECEIVED`, `INTERVIEW_SCHEDULED`, `ROUND_RESCHEDULED`) → mail when linked to mail, else note; everything else (`APPLICATION_CREATED`, `MANUAL_NOTE`, `MAIL_UNLINKED`, …) → note | good / bad / sent / mail / note |
| Linked mail not already referenced by an event's `payload.mailMessageId`                                                                                                                                                                                                                                                                                                                | mail                            |
| `SCHEDULED` round with `scheduled_at` ("Round N · <kind>", OA: "OA closes")                                                                                                                                                                                                                                                                                                             | upcoming                        |
| Future follow-up date (`next_action_at`), labelled by `next_action_note` or "Follow up"                                                                                                                                                                                                                                                                                                 | upcoming                        |
| Open mail whose triage suggests a record in this lane                                                                                                                                                                                                                                                                                                                                   | pending                         |

- `role` is set when the lane has two or more records. `via` is the method label for outreach
  records.
- Settled rounds are not drawn separately; their outcome events already are.
- Dots are sorted by time.

### 2.4 Next column

`buildQueue` runs unchanged over all records and triage mail. Mail items without a record (new roles, unmatched replies) belong to no lane and are counted by the Emails drawer instead. For each lane, the item with the
lowest due rank (overdue < today < week) then earliest `dueAt` among the lane's records is its
next step. It shows the due dot, a "when" phrase ("6 days late", "Today, 4:00 pm",
"Mon 6 Oct", "New email") and one action. With several open roles the role name prefixes the
text.

When no item is due within the horizon:

- an open Applied or Interviewing lead with a running clock shows the threshold date and "Follow
  up if it stays quiet";
- Preparing shows "Finish and send it";
- closed lanes show "Done".

Every action **opens the lane expansion** with the right preselection; nothing writes from the
column itself:

| Queue reason                                | Action label    | Opens with                             |
| ------------------------------------------- | --------------- | -------------------------------------- |
| `mail` (update with outcome)                | Link it         | `mail=<id>&outcome=<suggestedOutcome>` |
| `mail` (acknowledgement)                    | Add to timeline | `mail=<id>` (links without an outcome) |
| `round` after its time                      | Record result   | outcome chips for the booked round     |
| `silence`                                   | I followed up   | `outcome=followup`                     |
| `followup`, `round`, `deadline` before time | Open            | expansion only                         |

### 2.5 Order and groups

- **Needs you**: lanes whose next step is overdue or today, by due rank then `dueAt`.
- **In progress**: other open lanes, by next date ascending, then latest activity descending.
- **Closed**: every record closed, by latest activity descending, collapsed by default.

### 2.6 Axis and drawing

- Window: from 2 days before the earliest dot on an open lane (and not after today) to the end of
  the 7th IST day after today. The window is at least 14 days wide (extended backwards) and at
  most 12 weeks (start clamped).
- Dots before the start collapse into one "◂ earlier" stack at the left edge.
- All day maths uses Asia/Kolkata.
- Ticks: daily up to 10 days, every 3 days up to 21, else weekly. Tick labels within 5% of Today
  are hidden. Today is a `bg-review` line with a "Today" tag.
- Per lane: a solid line from the first dot to Today (to the last dot for closed lanes), a dashed
  line from Today to the last upcoming dot, and dots positioned by time.
- Dots within 4.5% of the chart width stack. A stack shows its most important dot (pending >
  upcoming > bad > good > mail > sent > note) with a count badge. Its readout lists every entry.
- Hover or focus on a dot sets the readout: "<Company> · [<role> ·] <label>, <date> (<detail>)"
  for each stacked entry. Dots are buttons with the same text as their accessible name.
- Phone: the chart scrolls sideways inside its card (min width 50rem) with the company column
  sticky on the left. The page itself never scrolls sideways.

### 2.7 Expanded lane

Selecting a company cell or dot sets `open=<laneKey>` (one lane at a time; selecting again
closes it). The expansion sits under the lane row:

- **Header line**: roles and cities, how each was sent, and **Open record** for the selected role.
- **Role switcher** (two or more records): pills "<role> · <status label>" setting `role`;
  default is the lead.
- **History**: one vertical timeline of the lane's dots, newest first, with a Today divider
  between upcoming and past entries. Entries carry role and method tags. A pending-mail entry
  offers **Link it**, **Link elsewhere** (existing record picker) and **Dismiss**.
- **Next step** box for the selected role, then **What happened?** (existing `OutcomeChips`
  with that record's `availableOutcomes`, `initial` from `outcome`, `mailId` from `mail`). Then
  the existing follow-up control. Preparing records show the existing `PreparingControl`.

Outcome recording, mail linking and follow-up writes use the existing server actions and keep
their validation and revalidation. After revalidation the page reloads with `open` intact.

## 3. Mail on lanes

- Open mail in the `updates` bucket with a suggested record becomes a pending dot on that
  record's lane. So does a suggested `APPLICATION_ACKNOWLEDGEMENT`.
- **Link it** records the suggested outcome with the mail attached through the existing outcome
  service (OA invite → OA round). An acknowledgement is linked with no outcome; it records
  "Heard back" only if the record is still `APPLIED`, as today.
- **Link elsewhere** and **Dismiss** use the existing triage actions. Matching itself (local
  classifier and suggestion) is unchanged; nothing links without the user's click.

## 4. Emails drawer

A right-side drawer over the page (full width on phones), opened by the header button or
`?emails=1`, closed by its close button, Escape or the scrim. Focus moves into it on open and back
to the button on close. Sections, top to bottom:

1. **Inboxes**: one line per connection with provider dot, address and "Refreshed <relative> ·
   N new". On error it shows the error and **Reconnect**. Then **Refresh all inboxes**, the
   existing `RefreshAllButton` and fresh-mail feedback.
   - With no connections: **Connect Gmail** and **Connect Outlook**.
   - An unconfigured provider says "<Provider> isn't set up on this computer yet". A **Setup
     details** disclosure lists the missing variable names and points to README › Inbox setup.
2. **Replies we couldn't match · N**: `updates` mail without a suggested record. Each card has
   the existing record picker (labelled "<company> · <role>") and **Link**, which continues into
   that lane's expansion with the suggested outcome.
3. **New roles · N**: `roles` bucket. **Save as opening** (`/jobs/new?fromMail=<id>`) and
   **Dismiss**.
4. **Job alerts and auto-replies · N**: `noise` bucket. **Dismiss**, **Clear all**, and
   "N handled · Undo last dismiss" (existing undo).
5. **Import messages** link (`/mail/import`).

Each card shows the inbox dot and address, received date and subject; the subject opens
`/mail/[id]`. Badge count = sections 2 + 3. Noise is listed but not counted.

## 5. Record page (`/applications/[id]`)

- History renders with the shared vertical timeline: readable IST dates ("3 Oct, 4:19 pm",
  "Today, 9:12 am") instead of "2026-10-03 16:19 Asia/Kolkata".
- Notes clamp to 4 lines with **Show all** / **Show less** when longer.
- Everything else is unchanged.

## 6. Routes and links

| Route or link                                                                           | Change                                 |
| --------------------------------------------------------------------------------------- | -------------------------------------- |
| `/inbox`, `/mail`, `/mail/review`                                                       | Redirect to `/applications?emails=1`.  |
| `/mail/[id]` back link, `/jobs/new` mail link                                           | `/applications?emails=1`.              |
| OAuth connect/callback and triage-action redirects, `notice`                            | `/applications?emails=1&notice=…`.     |
| Mail connections settings link, header inbox icon, Home mail links, simple-preview link | `/applications?emails=1`.              |
| Home stat links, record-action redirects (`?tab=next…`)                                 | `/applications`.                       |
| `/gallery/applications`, `/gallery/applications/timeline`                               | Kept as records of the chosen options. |

## 7. Code layout

| Path                                            | Responsibility                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `features/applications/lanes.ts`                | Pure: `companyKey`, `buildLanes`, `laneStatus`, `laneNext`, `laneWindow`, `stackDots`. |
| `features/applications/views/lanes.tsx`         | Client chart: readout, axis, lanes, stacks, sticky column, expansion.                  |
| `features/applications/views/lane-detail.tsx`   | Expanded lane: role switcher, history, next box, chips, follow-up.                     |
| `features/applications/views/timeline.tsx`      | Vertical timeline shared by the expansion and the record page.                         |
| `features/applications/views/emails-drawer.tsx` | Drawer shell and sections, reusing inbox status and triage actions.                    |
| `features/applications/navigation.ts`           | Reduced to legacy-parameter translation and `open`/`role` parsing.                     |
| `app/applications/page.tsx`                     | Loads records, triage, connections and queue; renders header, lanes, drawer.           |

Removed: `views/next.tsx`, `views/records.tsx`, `views/tabs.tsx`, `views/emails.tsx` (its card
pieces move into the drawer), and the tab and filter code in `navigation.ts`. The snooze UI and
its toast go; `queue_snoozes` rows are left in place and still honoured by `buildQueue` until
they expire.

`typicalRoundsByName` and lanes share one normalization (`companyKey`). Styling uses shared
Tailwind theme tokens only.

## 8. Errors and edge cases

- A lane whose records all lack events still shows a dot from `applied_at` or creation time.
- An invalid `open`, `role`, `mail` or `outcome` parameter is ignored. `mail` must pass the
  existing `readOpenMail` gate for that record.
- A refresh with every inbox failing keeps lanes and existing mail visible and lists each error
  in the drawer.
- Very long company or role names truncate in the lane column, with the full text in the
  expansion.

## 9. Testing

- **Unit (vitest, fixed clock)**:
  - `companyKey` with aliases
  - grouping two roles and a referral into one lane
  - lead selection and the closed-only-when-all-closed rule
  - every status row in §2.2, including " · +K role(s)" and " · new email"
  - dot sources and mail de-duplication against event payloads
  - next-step choice and its fallbacks
  - group ordering
  - `laneWindow` minimum, 12-week clamp and the "earlier" stack
  - `stackDots` thresholds and lead dot
  - legacy parameter translation
- **E2E (Playwright, marked `jobops_e2e` database, port 3211)**:
  - seeded records render as lanes in §2.5 order, with the Today line
  - expand a lane, record "Got an OA": the dashed OA dot appears and the status changes
  - two roles at one company share a lane, and the role switcher scopes the chips
  - a matched assessment mail shows as a pending dot; **Link it** creates the OA round
  - drawer: link an unmatched reply, save a new role as an opening, clear all alerts, undo
  - `?tab=emails` and `/inbox` open the drawer
  - at 390 px the chart scrolls inside its card and the page does not overflow
- `application-next.spec.ts` and `application-records.spec.ts` are replaced. Other specs and unit
  tests touching tabs or links are updated. Existing outcome, mail and refresh tests keep passing.

## 10. Delivery

1. **Lanes**: §1, §2, §6 for Home and record redirects, with the current Emails view mounted
   inside the drawer as is. Tabs removed.
2. **Mail and drawer**: §3, §4, the remaining §6 links and redirects.
3. **Record page**: §5.

Each phase ships working and is committed separately.

## Out of scope

Schema changes, new mail classification or automatic linking, per-role lanes, snoozing, and
changes to outcome rules, providers or refresh.
