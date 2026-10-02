# Applications redesign: a Next queue, real rounds and one inbox across three accounts

Date: 2026-10-03 · Status: design approved; implementation not started
Gallery: `/gallery/applications` (picks: Next queue B, All records B, What happened? A, Emails tab C,
Application page A)

## Goal

Applications should first answer _what do I do next_, then _where does each record stand_. Today the
page is a card grid sorted by last update: it never shows follow-up dates, how long a record has been
quiet, which round comes next, or recruiting mail waiting for a decision. Stages are picked by hand
from a 14-value dropdown.

After this change:

- **Next** lists what needs the user, built from follow-up dates they set, records that have gone
  quiet, booked rounds and OAs, and recruiting mail they have not handled.
- **Records** shows every application and outreach with its real interview rounds.
- **Emails** refreshes three inboxes (one Gmail, two personal Outlook) on demand and sorts recruiting
  mail into updates, new roles and noise.
- Progress is recorded by saying **what happened** (got an OA, cleared the round, rejected, ...);
  the stage follows from that.

Nothing is invented. Every queue item, day count and round comes from recorded dates, events, rounds
or mail. Nothing is sent from the app and no AI model is called; mail is classified by the existing
local rules.

## 1. Pages and routes

### 1.1 `/applications`

A page header ("Applications", action **Record an application** → `/applications/new`) above a
segmented tab bar. The tab is read from `?tab=next|records|emails` (default `next`). Each tab label
carries a count: Next = overdue + today items, Records = active records, Emails = messages needing a
decision.

**Next tab (gallery Next queue B, agenda spine).**

- When any item is overdue, a `bg-danger-soft` band titled "N slipped past their date" lists them as
  pills: company name and the item's primary action. Clicking a pill runs that action.
- Below it, a vertical rail: a yellow `bg-review` dot labelled "Today · <weekday d MMM>", today's
  items, then a blue dot labelled "Rest of the week" and items due in the next 7 days.
- Each row: time column (`h:mm a` for today, `d MMM` for later, "New mail" for mail items), reason
  icon, title, one-line detail, primary action as an outline pill button, and a snooze icon button
  (today and overdue items only; snoozes 2 days).
- Mail items lead today's group because they have no time slot; the rest sort by due time.
- After an action or snooze, an inverse-surface toast confirms what changed and offers **Undo** for
  snoozes.
- Empty state: "Nothing needs you right now" with **Refresh inboxes** and **Record an application**.

**Records tab (gallery All records B, round ladder).**

- Filter chips with counts: Active (default), Interviewing (Interviewing + Decision), Waiting on them
  (Applied and the silence clock is running), Closed, All. A search field matches company, role and
  contact name.
- Desktop columns: Opening | Rounds | Latest. Mobile stacks them.
- Rounds column for an application: the round ladder (§2.4) followed by the quiet-days chip when the
  silence clock runs. "Not sent yet" in Preparing. For outreach rows: the quiet-days chip only.
- An outreach record linked to an application (same job) renders nested under it, indented on a
  dashed rail, showing method, contact and latest event. Unlinked outreach gets its own row.
- Latest column: the latest event's summary (green for Decision, red for Closed) and "Today" or
  "Nd ago".
- Each row links to `/applications/[id]`.

**Emails tab (gallery Emails tab C, triage buckets).** See §4.4.

**Legacy links.** `?view=applied` → Records/Active, `?view=interviews` and `?view=offers` →
Records/Interviewing. Home's links are updated to the new URLs.

### 1.2 `/applications/[id]` (gallery Application page A, two columns)

Header: company mark, company, role and city; outline pills **Job post** (job URL, new tab) and the
resume file (downloads the exact version used). Outreach records show method and contact in place
of the role line.

Left column:

1. **Progress card**: phase bar (§2.3) with the round ladder, then **What happened?** outcome chips
   (§3.1), then the follow-up control: "Follow up on <date>" or "Set a follow-up", opening an inline
   date + note form with **Save** and **Clear**.
2. **Rounds**: numbered list. Each round shows a family-coloured dot, "<kind label> · <name>", date
   and time in IST, and a status pill (Cleared green, Not cleared red, Today yellow, Upcoming blue,
   Cancelled muted). A booked round has a soft yellow background. Research-typical slots not yet
   reached render as dashed "Not scheduled yet" rows (§2.4). Each round row has an edit affordance
   for name, time and notes.
3. **Notes**: the record's `notes`, edited inline.

Right column:

1. **Linked records** card (`bg-selected`) for each other record on the same job: method, contact,
   latest event, link.
2. **History**: one timeline merging this record's events and linked mail, plus events of linked
   outreach (suffixed "· Referral ask" etc.), newest first. Mail entries use a mail icon and link to
   `/mail/[id]`.

A collapsed **Edit details** section keeps the application URL, the resume version (locked once the
record is sent, as today) and notes. The stage dropdown is removed.

### 1.3 Other routes

| Route                              | Change                                                              |
| ---------------------------------- | ------------------------------------------------------------------- |
| `/inbox`, `/mail`, `/mail/review`  | Redirect to `/applications?tab=emails` (filters dropped).           |
| `/mail/[id]`                       | Stays as the message reader; gains the same bucket actions as §4.4. |
| `/mail/import`                     | Stays (JSON fallback); linked from the Emails tab.                  |
| `/applications/new`, `/outreach`   | Unchanged in this redesign.                                         |
| Header inbox icon, Home mail links | Point at `/applications?tab=emails`.                                |
| `/gallery/applications`            | Kept as the record of the chosen options.                           |

## 2. Data model

### 2.1 New table `application_rounds`

| Column                     | Type                                   | Rule                                                            |
| -------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| `id`                       | uuid pk                                |                                                                 |
| `application_id`           | uuid fk → applications, cascade delete | Indexed with `position`.                                        |
| `kind`                     | enum `round_kind`                      | The 8 kinds in `features/companies/metrics.ts#roundKinds`.      |
| `name`                     | text, default `""`                     | Free label ("Problem solving", "Machine coding").               |
| `scheduled_at`             | timestamptz, nullable                  | Interview start, or complete-by time for an OA. Null = unknown. |
| `outcome`                  | enum `round_outcome`                   | `SCHEDULED`, `PASSED`, `FAILED`, `CANCELLED`.                   |
| `position`                 | integer                                | 1-based order within the application.                           |
| `notes`                    | text, default `""`                     |                                                                 |
| `created_at`, `updated_at` | timestamptz                            |                                                                 |

At most one round per application may be `SCHEDULED` (partial unique index on `application_id`
where `outcome = 'SCHEDULED'`).

### 2.2 Changes to existing tables

- `applications.closed_reason`: enum `application_close_reason` (`REJECTED`, `NO_REPLY`,
  `WITHDREW`, `ACCEPTED`, `DECLINED`), nullable; set exactly when the phase is Closed.
- `applications.next_action_note`: text, default `""`. `next_action_at` keeps its role as the
  follow-up date.
- New table `queue_snoozes`: `item_key` text primary key, `until` timestamptz, `created_at`.
- `applications.status` stays and keeps its enum. Only the outcome service (§3) and the existing
  record/create actions write it. Companies' pipeline, Home counts and the CSV export continue to
  read it unchanged.

Mail changes are in §4.2.

### 2.3 Phase (derived, pure)

| Status                                                                                          | Phase        |
| ----------------------------------------------------------------------------------------------- | ------------ |
| `DRAFT`, `PREPARING`, `READY_FOR_REVIEW`                                                        | Preparing    |
| `APPLIED`, `ACKNOWLEDGED`                                                                       | Applied      |
| `ASSESSMENT`, `RECRUITER_SCREEN`, `TECHNICAL_INTERVIEW`, `MANAGER_INTERVIEW`, `FINAL_INTERVIEW` | Interviewing |
| `OFFER`                                                                                         | Decision     |
| `REJECTED`, `WITHDRAWN`, `CLOSED`                                                               | Closed       |

Outreach records (`source` ≠ `DIRECT`) are Preparing until an `OUTREACH_SENT` event exists, then
Applied, then Closed when closed. The phase bar shows four segments (Preparing → Decision); Closed
greys the first three and turns the last red, or all green for `ACCEPTED`. Its label reads the
phase, with "· round N of M" while Interviewing (M only when §2.4 supplies it).

### 2.4 Round ladder

One dot per recorded round in `position` order: filled in the round family colour with a check for
`PASSED`, red with a cross for `FAILED`, ringed in `review` yellow for `SCHEDULED`, muted for
`CANCELLED`. Hover or focus shows kind, name, date/time and outcome.

Dashed "still to come" dots appear only when the company has research data: `typicalRounds` from
`companyMetrics` for the matching company (matched the same way Companies matches applications). The
tooltip says "Typical loop: N rounds (company research)". Without research, no dashed dots.

## 3. Recording what happened

### 3.1 Outcomes (gallery What happened? A, outcome chips)

Chips are tonal blue for forward moves, red-outlined for setbacks and neutral outline otherwise.
Only the chips valid for the current state render; the server enforces the same table.

| State                          | Chips offered                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Preparing (direct)             | none (the existing "record as sent" flow applies)                                                        |
| Applied, no rounds             | Heard back · Got an OA · Round scheduled · Sent a follow-up · Rejected · No reply, close it · I withdrew |
| A round is `SCHEDULED`         | Cleared the round · Didn't clear it · Rescheduled · Rejected · I withdrew                                |
| Interviewing, nothing booked   | Round scheduled · Got an offer · Sent a follow-up · Rejected · No reply, close it · I withdrew           |
| Decision                       | Accepted the offer · Declined the offer                                                                  |
| Closed                         | none                                                                                                     |
| Outreach, sent, awaiting reply | Replied · Sent a follow-up · No reply, close it                                                          |
| Outreach, replied              | Referral submitted · Not able to refer · I withdrew                                                      |

Chips that need detail open an inline panel before saving:

- **Got an OA**: complete-by date (IST), optional name (e.g. "HackerRank").
- **Round scheduled**: round kind (select), date and time (IST), optional name.
- **Rescheduled**: new date and time.
- Every outcome: optional "date it happened" (defaults to now, never in the future) and an
  optional note.

### 3.2 Outcome service

`recordOutcome(applicationId, outcome, detail, mailMessageId?)` runs one transaction with
`SELECT … FOR UPDATE` on the application:

1. Validate the outcome against §3.1 for the locked row; reject otherwise with a message naming the
   current state.
2. Apply round changes: OA and Round scheduled insert a `SCHEDULED` round at the next position;
   Cleared/Didn't clear settle the booked round to `PASSED`/`FAILED`; Rescheduled updates its time.
3. Set `status` and `closed_reason`:

| Outcome                   | status                                                                        | closed_reason           |
| ------------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| Heard back, Replied       | `ACKNOWLEDGED` if `APPLIED`, else unchanged                                   |                         |
| Sent a follow-up          | unchanged                                                                     |                         |
| Referral submitted        | unchanged                                                                     |                         |
| Not able to refer         | `CLOSED`                                                                      | `REJECTED`              |
| Got an OA                 | `ASSESSMENT`                                                                  |                         |
| Round scheduled           | `MANAGER_INTERVIEW` for BEHAVIORAL/HIRING_MANAGER, else `TECHNICAL_INTERVIEW` |                         |
| Cleared the round         | unchanged                                                                     |                         |
| Didn't clear it, Rejected | `REJECTED`                                                                    | `REJECTED`              |
| No reply, close it        | `CLOSED`                                                                      | `NO_REPLY`              |
| I withdrew                | `WITHDRAWN`                                                                   | `WITHDREW`              |
| Got an offer              | `OFFER`                                                                       |                         |
| Accepted / Declined       | `CLOSED`                                                                      | `ACCEPTED` / `DECLINED` |

4. Insert an `application_events` row: event type from the existing vocabulary where one fits
   (`ASSESSMENT_RECEIVED`, `INTERVIEW_SCHEDULED`, `REJECTION_RECEIVED`, `OFFER_RECEIVED`, …), new
   types `REPLY_RECEIVED`, `ROUND_PASSED`, `ROUND_FAILED`, `ROUND_RESCHEDULED`,
   `FOLLOW_UP_SENT`, `CLOSED_NO_REPLY`, `WITHDRAWN`, `OFFER_ACCEPTED`, `OFFER_DECLINED`,
   `REFERRAL_SUBMITTED`, `REFERRAL_DECLINED`. Payload: previous/next status, round id, detail,
   `mailMessageId` when linked.
5. When `mailMessageId` is given, link that message and resolve its mail event (§4.4).
6. Update the job status with the existing `jobStateForApplication`, write an activity log, and
   revalidate `/applications`, the record, `/companies` and `/`.

The existing rule that `APPLIED` needs the user's explicit confirmation stays in the record/create
flow and is not reachable from the chips.

## 4. Mail across three inboxes

### 4.1 Accounts and providers

The user's inboxes are one Gmail and two personal Outlook accounts (outlook.in and outlook.com).
Both Outlook accounts sign in through one Microsoft app registration.

`src/services/mail/providers/` exposes one interface:

```ts
type MailProvider = {
  id: "GMAIL" | "OUTLOOK";
  configuration(): { configured: boolean; missing: string[] };
  authorizeUrl(state: string, codeChallenge: string): URL;
  exchangeCode(code: string, verifier: string): Promise<{ email: string; tokens: Tokens }>;
  accessToken(connection: MailConnection): Promise<string>; // refreshes and persists when near expiry
  listRecruitingMail(
    connection: MailConnection,
    cursor?: Cursor,
  ): Promise<{
    messages: MailImportRecord[];
    nextCursor?: Cursor;
  }>;
};
```

- **Gmail**: the existing `services/mail/gmail.ts` moves behind the interface unchanged in
  behaviour (read-only scope check, PKCE, search query, 5-way fetch).
- **Outlook**: Microsoft identity platform `consumers` tenant, authorization code + PKCE with a
  confidential web client, scopes `offline_access User.Read Mail.Read`. The returned scope set must
  contain no write scope. The email comes from `GET /me` (`mail`, else `userPrincipalName`).
  Messages come from `GET /me/mailFolders/inbox/messages` with
  `$filter=receivedDateTime ge <since>`, `$select` of the needed fields, `$top=50`,
  `$orderby=receivedDateTime desc` and `Prefer: outlook.body-content-type="text"`; paging follows
  `@odata.nextLink`. The existing local classifier filters relevance, as for Gmail.
- `since` is `lastSyncedAt − 1 day`, or 30 days back on first sync. A refresh reads at most 4 pages
  per inbox and stores a continuation cursor, as Gmail sync does today.

### 4.2 Schema

- Rename `gmail_connections` → `mail_connections`; add `provider` (text, default `GMAIL`),
  `last_refreshed_count` (integer), `last_error` (text). Unique index becomes `(provider, email)`.
- `mail_messages.account_email` (text, nullable): the inbox that received it. Import from JSON
  leaves it null.
- Outlook messages use `internetMessageId` as `external_id`, because Graph's message `id` changes
  when a message moves between folders. Gmail keeps its message id. Dedup stays on
  `(provider, external_id)`.
- Settings cursor keys become `mailCursor:<connectionId>`; the migration moves existing
  `gmailCursor:*` keys.

### 4.3 Configuration and routes

| Variable                                                                   | Purpose                                                                            |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`          | Existing. Redirect becomes `/api/mail/gmail/callback`.                             |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI` | New. Redirect `/api/mail/outlook/callback`.                                        |
| `MAIL_TOKEN_ENCRYPTION_KEY`                                                | Renamed from `GMAIL_TOKEN_ENCRYPTION_KEY`; the old name is still read as fallback. |

Routes `/api/mail/[provider]/connect` and `/api/mail/[provider]/callback` replace `/api/gmail/*`
(no Gmail connection exists yet, so nothing to migrate). The redirect URI safety checks in
`gmailConfiguration` apply to both providers.

README gains a setup section:

- **Google**: create an OAuth client, add the redirect URI, and **publish the consent screen to
  "In production"** (an unverified app is fine for personal use). In "Testing" status Google expires
  refresh tokens after 7 days and refresh stops working weekly.
- **Microsoft**: one Entra app registration with "Personal Microsoft accounts only", web redirect
  URI, a client secret, and delegated `Mail.Read`, `User.Read`, `offline_access`.

### 4.4 Emails tab (gallery Emails tab C, triage buckets)

Banner (`bg-selected`): "<N> messages need a decision" and, after a refresh, "· <M> arrived just
now"; **Refresh all inboxes** on the right. Below the banner, one status line per connection:
provider dot, email, "Refreshed <relative time> · <count> new", or the error with **Reconnect**.
With no connections: **Connect Gmail** and **Connect Outlook** buttons, disabled with the missing
variable names when the provider is unconfigured, plus a link to Import messages.

**Refresh all inboxes** is one server action running every connection's refresh with
`Promise.allSettled`. Each connection records `last_refreshed_count` or `last_error`; one failing
inbox never blocks the others. The app-wide loading popup covers the wait.

Three buckets, each a column on desktop and stacked on mobile:

| Bucket                      | Contents (open messages only)                                                                                                                       | Primary action                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Updates on your records** | Classified INTERVIEW, ASSESSMENT, OFFER, REJECTION or FOLLOW_UP. With a suggested record: "Matches <company> · <role>". Without: a record picker.   | **Link and update**: opens the §3.1 chips for that record with the outcome preselected from the classification, the mail attached.    |
| **New roles for you**       | RECRUITER_OUTREACH without a matched record.                                                                                                        | **Save as opening**: `/jobs/new?fromMail=<id>` prefilled with subject, sender name and mail link; the user confirms company and role. |
| **Probably noise**          | APPLICATION_ACKNOWLEDGEMENT, UNKNOWN, and senders on the job-alert list (`naukri.com`, `jobs-noreply@linkedin.com`, `instahyre.com`, `foundit.in`). | **Dismiss**, plus **Dismiss all N** for the bucket.                                                                                   |

Every card shows the inbox dot and address, date, subject and match line; the card title opens
`/mail/[id]`. A matched acknowledgement offers **Link** without an outcome (it records "Heard
back" only if the record is still `APPLIED`). Handled messages leave the buckets; "N handled ·
Undo last dismiss" restores the most recent dismissal. Links are undone from the record, not
here, because they may have recorded an outcome.

Dismiss sets the mail event to `DISMISSED` and `attention_state` to `DONE`. Link sets it to
`REVIEWED` and fills `linked_application_id` on both rows, as `reviewMailEvent` does today.

## 5. The Next queue

`buildQueue({ records, rounds, events, mail, snoozes, now })` is pure and returns items
`{ key, recordId, due: "overdue" | "today" | "week", dueAt, reason, title, detail, action }` for
everything due up to the end of the 7th IST day from `now`. All day arithmetic is in Asia/Kolkata.

| Reason     | Source and rule                                                                                                                                | Key                | Primary action                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `followup` | `next_action_at` set and the phase is not Closed. Title is `next_action_note`, else "Follow up with <company>".                                | `followup:<appId>` | Open record                                                                                        |
| `silence`  | Silence clock (§5.1) reaches its threshold.                                                                                                    | `silence:<appId>`  | Record follow-up (opens the chips with "Sent a follow-up" selected); secondary "Close as no reply" |
| `round`    | A `SCHEDULED` round with `scheduled_at` in the window. Once its time has passed it becomes "Record the <kind> result" and stays until settled. | `round:<roundId>`  | Record result (after) / Open record                                                                |
| `deadline` | An OA (`ONLINE_ASSESSMENT`) round's complete-by time in the window.                                                                            | `round:<roundId>`  | Open record                                                                                        |
| `mail`     | Open messages in the Updates or New roles buckets. "today" if it arrived today or yesterday (IST), "overdue" after that.                       | `mail:<mailId>`    | Link and update / Save as opening                                                                  |

Due bucket: before today's start → overdue; within today → today; otherwise week. Snoozed keys are
dropped while `until > now`; snoozes expire on their own and stale rows are deleted on write.
Resolving an item is always the real action (recording the outcome, linking the mail, changing the
follow-up date), never a separate "done" flag.

### 5.1 Silence clock

- Runs only in Applied (direct or outreach) and Interviewing with no `SCHEDULED` round.
- Starts at the latest of: `applied_at` / the `OUTREACH_SENT` time, the latest `FOLLOW_UP_SENT`
  event, and the latest inbound signal.
- Inbound signals: events `REPLY_RECEIVED`, `ASSESSMENT_RECEIVED`, `INTERVIEW_*`, `ROUND_*`,
  `OFFER_RECEIVED`, `REFERRAL_*`, and linked mail other than acknowledgements.
- For outreach, the first inbound signal stops the clock until the next `FOLLOW_UP_SENT`.
- Threshold: 7 days for direct applications, 5 days for outreach (constants in
  `features/applications/queue.ts`). The quiet-days chip shows "Nd of T" below the threshold and
  "Nd quiet" in amber at or above it.

## 6. Code layout

| Path                                               | Responsibility                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| `features/applications/phase.ts`                   | Status → phase, outcome availability table (§2.3, §3.1). Pure.             |
| `features/applications/outcomes.ts`                | `recordOutcome` server action and transaction (§3.2).                      |
| `features/applications/queue.ts`                   | `buildQueue`, silence clock, thresholds (§5). Pure.                        |
| `features/applications/read.ts`                    | Loads records, rounds, events, linked mail, research round counts.         |
| `features/applications/views/next.tsx`             | Agenda spine.                                                              |
| `features/applications/views/records.tsx`          | Round ladder list, filters, search.                                        |
| `features/applications/views/emails.tsx`           | Banner, connection status, buckets.                                        |
| `features/applications/views/detail.tsx`           | Two-column record page.                                                    |
| `features/applications/views/marks.tsx`            | Round ladder, phase bar, quiet-days chip, company mark (from the gallery). |
| `features/mail/triage.ts`                          | Bucket assignment and job-alert sender list. Pure.                         |
| `services/mail/providers/{index,gmail,outlook}.ts` | §4.1 interface and implementations.                                        |

Styling uses the shared Tailwind theme tokens only; no component-local palette literals.

## 7. Delivery phases

1. **Tracking core**: §2 schema, §3, §5, the Next and Records tabs, and the record page. Emails tab
   shows the existing Gmail/import refresh until phase 2.
2. **Emails tab**: §4.4 on existing providers and imported mail, redirects in §1.3, mail-linked
   outcomes and Save as opening.
3. **Three inboxes**: §4.1 to §4.3, Outlook provider, Refresh all, README setup.

Each phase ships working and is committed separately.

## 8. Errors

- Outcome validation errors name the current state and the allowed outcomes.
- Per inbox: missing configuration lists the missing variables; expired or revoked access shows
  **Reconnect**; HTTP 429 says to wait and retry; network timeouts keep the cursor for the next try.
- A refresh with every inbox failing shows the errors and keeps existing mail visible.
- Dates in the future are rejected for "date it happened"; scheduled times may be in the future.

## 9. Testing

- **Unit (vitest)**: phase mapping; outcome availability and the §3.2 status table; silence clock
  edge cases (acknowledgement does not reset, a follow-up restarts, booked round pauses, IST midnight);
  `buildQueue` bucket boundaries and snooze expiry with a fixed clock; triage bucket assignment;
  Outlook provider request building, paging and `internetMessageId` dedup with mocked `fetch`;
  scope checks rejecting write scopes for both providers.
- **E2E (Playwright, marked `jobops_e2e` database, port 3211)**: record OA → cleared → round
  scheduled → offer → accepted on the record page, with the ladder and history updating; a seeded
  outreach sent 6 days ago appears in Next as quiet, and recording a follow-up removes it; Emails
  buckets with seeded mail: link an assessment (creates the OA round), save a recruiter mail as an
  opening, dismiss all noise.
- Existing applications, mail and home tests keep passing; updated where routes moved.
