# Applications that keep up with mail — design

Builds on `2026-10-31-company-timeline-design.md` (company timeline and handling bar) and
`2026-10-31-job-mail-feed-and-search-design.md` (tags, Fetch new mail, company search). Replaces the
calendar lanes from `2026-10-03-applications-lanes-design.md`.

## Why

On 2026-10-31 the user found that Applications disagreed with Mail. Oracle and Weave had both sent
rejections, but Applications still listed them as _Applied · Quiet for 28 days · 21 days late_,
and Mail's company rail said the same thing about Oracle while showing the rejection on its
timeline. Of the 65 kept emails, none was linked to an application.

The calendar lanes also failed as a page. All dots bunched at one date, the lines ran empty across
the month, and every row showed the same "21 days late / I followed up" text, so the page answered
neither "what happened?" nor "what do I do next?".

Success means that when a rejection, offer or acknowledgement arrives, every page shows it without
the user doing anything. Emails that need a decision (an assessment deadline or an interview slot)
are the only ones that ask. Applications becomes a calm list that shows how far each application
got and the one thing to do next.

## Root cause (as found on 2026-10-31)

- Applications reads mail only through `readMailTriage` (`src/features/mail/read.ts`). That returns
  **open** mail plus a `suggestedApplicationId` from `mail_events`. Emails reach a lane only if
  they are still open, or if an application event references them.
- Mail reads by `mail_messages.company_key` through `listMail`, so it shows every email at the
  company, whether handled or not.
- `ingestPage` (`src/features/mail/ingest.ts`) and `includeMail` (`src/features/mail/include.ts`)
  store mail as handled (`attention_state = 'DONE'`) when it is _recovered_, meaning it was
  received before the inbox's last fetch. Company search finds most mail this way. Such mail is
  marked handled but never linked or recorded, so it is invisible to Applications and changes no
  status. All five recent job emails (Oracle rejection, Weave acknowledgement and rejection,
  ServiceNow acknowledgement, APEXX acknowledgement) arrived this way within a minute of each
  other.
- Applications, Mail's rail and Companies derive status from application records only
  (`recordStatus`, `laneStatus`, `companyStatus`). Until an outcome is recorded on the
  application, all three keep saying Applied or Quiet.

## Picks from the live gallery (`/gallery/applications-sync`, 2026-11-01)

| Section                              | Pick | What it means                                                                                                                         |
| ------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| When an email changes an application | C    | Acknowledgements, rejections and offers update the application on their own, with Undo. Assessment and interview emails ask.          |
| The Applications page                | C    | Each application shows its steps from Sent to Offer, with the day it reached each one, grouped Needs you, Waiting on them and Closed. |
| Opening an application               | B    | The row expands in place to show its journey, story, next step and facts; other rows stay put.                                        |

The gallery header also fixed these for every option, and the user accepted them:

- Every email filed under a company appears on that company's applications, on Applications and
  on Mail alike.
- Old mail found by company search can still change its application.
- When a company has more than one live application, its emails ask which one they belong to.
- Status comes from what happened. It never says Quiet after a rejection, and each row shows one
  next step.
- Previous jobs stay off the list.

## Goals, non-goals, anti-goals

- **Goals:** one source of truth for status across Applications, Mail and Companies; clear outcomes
  update by themselves; a page that shows progress and the next step at a glance.
- **Non-goals:** reading email bodies with an LLM; changing how mail is fetched, matched to
  companies or tagged; new outbound actions (nothing is ever sent for the user).
- **Anti-goals:**
  - An email updates the wrong application without telling the user.
  - Old mail from years ago (for example 2021 Amazon emails) changes a new application.
  - A silent change the user cannot undo.
  - Applications and Mail showing different statuses again.

## 1. When an email updates an application by itself

### Eligibility

An email **auto-applies** only when all of these hold:

1. It is kept (never excluded) and placed at exactly one company (`company_key` set).
2. That company has exactly **one live application**. Live means a direct application (not an
   outreach record such as a referral ask, cold email or LinkedIn message, and not a previous job)
   that has been sent and whose phase is not Closed. Previous jobs, outreach records and closed
   applications do not count against "exactly one". _(My call: outreach records never receive
   acknowledgements, rejections, offers or assessments by themselves; replies from a contacted
   person keep linking to them as today.)_
3. No stored link, `suggestedApplicationId` or `mail_tracking.applicationIds` names a
   **different** application. Matching does not have to have picked this one. That lets the rule
   run the same way on paths with no fresh matching result (catch-up, Include this, placing,
   retagging), and `matchMail` stays unchanged. _(My call.)_
4. The email was received on or after the application's sent date, comparing India calendar days.
   This keeps older mail (for example 2021 Amazon emails) away from a new application.
5. Nobody has acted on it yet. It has produced no outcome or link, no application event references
   it, and the user has not marked it Just info or dismissed it. The rule never overrides the
   user's own decisions.
6. The outcome is allowed from where the application stands (`availableOutcomes`). _(My call:
   `offer` becomes available from the Applied phase too, both by hand and from mail, because
   offers often follow rounds the user never recorded. With a round still booked, an offer email
   asks instead.)_

### Clear outcomes that fail the rule ask

An acknowledgement, rejection or offer is **relevant** when its company has at least one live
application and the email arrived on or after the earliest live application's sent day. If a
relevant email fails the rule (for example the company has several live applications, the outcome
isn't available, or another application is named), it stays **open** and asks. It shows the
handling bar with "Which role?" or the suggested outcome, and counts in Needs you. This follows the
gallery's fixed rule that such emails "always ask", and keeps any status from saying Quiet after
a rejection. Only mail that is not relevant keeps today's behaviour; when recovered, it arrives
handled.

### What each tag does when eligible

| Tag (classification)                                                                                           | Effect                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application (`APPLICATION_ACKNOWLEDGEMENT`)                                                                    | Linked through the existing `linkMailToRecord`: the application moves `APPLIED → ACKNOWLEDGED` and gets an `ACKNOWLEDGEMENT_RECEIVED` event. No Undo is needed; it changes no outcome.                                                      |
| Application rejected (`REJECTION`), rejected after interview (`INTERVIEW_REJECTION`, from the edit-tag design) | Recorded through the existing `applyOutcome` with outcome `rejected`, `mailMessageId` set and `happenedAt` = the email's received time. Undo is offered.                                                                                    |
| Offer (`OFFER`)                                                                                                | Same, with outcome `offer`. Undo is offered.                                                                                                                                                                                                |
| Interview call (`INTERVIEW`, `ASSESSMENT`), interview process (`INTERVIEW_UPDATE`)                             | Never auto-applies. The email is kept **open** with `suggestedApplicationId`, so it asks on the application row and on the Mail timeline with the existing handling bar (date or round form first).                                         |
| Everything else (`FOLLOW_UP`, recruiter, referral, background check, joining, other)                           | Unchanged from today. New mail arrives open and, when matched to a record, puts its row in Needs you until handled. Recovered history of these tags arrives handled. It always appears on its application's story (section 5). _(My call.)_ |

### Where the rule runs

- One server function, for example `autoApplyMail(tx, messageId, context, now)`, runs inside the
  same transaction as each write that can make an email eligible:
  - `ingestPage`, for Fetch new mail and company search,
  - `includeMail` ("Include this" on a dropped email),
  - placing an email at a company from Mail,
  - retagging an email (`MAIL_RETAGGED` in `handle-service.ts`).
- An auto-applied email ends linked to the application and handled (`attention_state = 'DONE'`),
  which is the same end state as pressing the button.
- Recovered mail changes as follows:
  - An eligible acknowledgement, rejection or offer auto-applies, whether or not it is recovered.
  - A relevant email that asks arrives **open**, even when it is recovered history. That covers an
    eligible assessment or interview email, and a relevant clear outcome that failed the rule.
  - Everything else that is recovered keeps today's behaviour and arrives handled.
- The previous-job rule (`previousJobFor`) runs first and is unchanged.
- An auto-applied outcome must look exactly like a manual one to every reader (status, phase,
  journey, history). The only difference is a marker in the event payload, `auto: true`, plus the
  values Undo needs to restore. The current `applyOutcome` stores `previousStatus`; it also needs
  the previous `closedReason` and the job's previous status.

### Undo

- Offered on the application's rejected or offer step, on the email row in the story, and on the
  email in the Mail timeline. It shows while the auto-applied event is still the application's
  latest outcome event. Once the user records anything newer, the history is theirs and Undo
  disappears.
- Undo deletes the auto event, restores the application's previous status and `closedReason`,
  restores the job's previous status, and writes `MAIL_OUTCOME_UNDONE` to the activity log. The
  email stays linked to the application and handled, so it remains on the story as information.
  The rule never re-applies an email whose outcome was undone; record that in the email's
  `mail_events.details` (for example `autoUndone: true`).
- Retagging an email whose auto outcome can still be undone first undoes it, then runs the rule
  for the new tag. If the outcome can no longer be undone, retagging changes only the tag.
- A retag that changes the tag clears `autoUndone`, whether the retag did the undo or the user
  pressed Undo earlier, because the user has given a new reading of the email. A retag to the same
  tag leaves it set, so a wrong match the user undid is never re-applied. _(My call.)_

## 2. One-time catch-up of existing mail

- A one-off script (or idempotent migration step) runs the section 1 rule over kept emails,
  oldest first, so Weave's acknowledgement applies before its rejection.
- It only touches emails the system filed. Those are open emails, or emails stored handled as
  recovered history (`mail_tracking.recovered`) that nobody acted on (no link, outcome, Just info
  or dismissal). Emails the user handled are left alone.
- Among those, it adds `suggestedApplicationId` where the rule asks, and re-opens them so they
  ask.
- Expected result on the user's data, as of 2026-11-01:
  - Oracle → Rejected (30 Oct).
  - Weave → Acknowledged (3 Oct), then Rejected (7 Oct).
  - ServiceNow → Acknowledged (28 Oct).
  - APEXX's acknowledgement stays in Needs a home, because it has no `company_key`. The user can
    place it, and placing then runs the rule.
  - Amazon's 59 emails are untouched, because Amazon has no application.
- It runs with the app's normal `db:migrate`, or as a documented `npm run` script that the Docker
  entrypoint calls once. Before running it against personal data, take a private database backup
  (backups stay uncommitted, per AGENTS.md).

## 3. One status everywhere

- Applications, Mail's company rail, Companies' status pill and Home read the same derived status
  and next step. Today that is `buildQueue` + `buildLanes` + `companyStatus`. After section 1
  writes real outcomes, these already agree for rejections, offers and acknowledgements.
- `readMailTriage` remains the source of open, asking mail for the Needs you signal. The
  application story (section 5) reads mail by link and by company instead of through triage.
- Status labels: Not sent, Applied, Acknowledged, Quiet N days (sent or acknowledged, with no reply
  past the silence clock: 7 days for applications, 5 for outreach), Online assessment, Interviewing,
  Offer, Rejected, Closed. The old "N days late" text appears only in the next step's due line
  ("Overdue since 9 Oct"), never as a second label.

## 4. The Applications page (`/applications`)

Approved layout C from the gallery.

- Three groups in this order: **Needs you**, **Waiting on them**, **Closed** (collapsed by default
  when it is long). Each group heading shows its count.
  - Needs you: an open email matched to the application, a booked round or OA due soon, a
    follow-up due or overdue, or an unsent (Preparing) application record. Saved jobs with no
    application record are not on this page.
  - Unsent records are always in Needs you, with a next step that follows the 14-day freshness
    policy:
    - "Apply by <date>" inside the window, with Record application.
    - "Check the posting date" when `postedAt` is unknown.
    - "Posting is N days old" past the window.
      Each also has a **Not applying** button, which closes the record (status `CLOSED`, close reason
      `WITHDREW`, event "Not applying") so it moves to Closed. _(My call. Nothing closes
      automatically; Not applying is a new small action, because no way exists today to close an
      unsent record.)_
  - Waiting on them: sent, nothing for the user to do yet.
  - Closed: rejected, withdrawn, closed with no reply, accepted or declined.
- Order inside a group: soonest due first, then most recent activity.
- One row per application (not per company), matching the current `by: "application"` lanes:
  - **Identity:** monogram, company, role.
  - **Journey:** four steps, Sent → Acknowledged → Interviewing → Offer. A step is filled when
    reached, and its India date sits under it. A rejection replaces the next unreached step with a
    red ✕ and its date, and later steps fade. An application closed without being sent shows a
    muted ✕ in the first position. An unsent application shows "Not sent" with every step hollow.
    Step dates come from records: sent = `appliedAt` or the sent event; acknowledged = the
    `ACKNOWLEDGEMENT_RECEIVED` event or linked acknowledgement; interviewing = the first OA or
    round event; offer = the offer event; rejected = the rejection event's `occurredAt`.
    Outreach records (referral ask, cold email, LinkedIn message) keep their own rows with a
    three-step journey: Sent → Replied → Referred (or ✕ "Not able to refer"). _(My call.)_
  - **Next step:** one line with its due line ("By Tue 3 Nov", "Overdue since 9 Oct") and at most
    one button for the primary action ("Record outcome", "Take the assessment", "I followed up",
    "Record application"). An asking email shows its suggested outcome button here instead. Closed
    rows say "Nothing to do".
- The header keeps "Record an application". Previous jobs stay in the existing collapsed
  "Previous jobs" list below.
- Colours use existing tokens only: the journey uses the mail tag stage colours (blue for applied,
  amber for interviewing, teal for offer, red for rejected), and status pills reuse the company
  status pill tones. No new palette literals.
- Phone width: identity, journey and next step stack in that order. The journey stays four
  columns.

## 5. Opening an application in place

Approved layout B.

- Pressing a row expands it beneath itself. Only one is open at a time, and pressing it again
  closes it. The URL reflects it (`/applications?open=<applicationId>`), so links from Mail, Home
  and the old `/applications/<id>?outcome=…&mail=…` deep links can open it with the outcome form
  ready.
- The expanded area has two columns (stacked on a phone):
  - **Left:** the journey (larger), then the **story**: emails and steps in one dated ledger,
    newest first, in the same visual style as the Mail timeline rows.
    - Emails shown: every email linked to this application, plus emails placed at the company and
      linked to no application, received on or after the day the application was saved. When the
      company has several applications, those unlinked emails show on each, marked "Not linked to
      a role yet", with the handling bar's "Which role?" choice.
    - Steps shown: the application's events and rounds, with mail-driven events folded into their
      email exactly as the company timeline does.
    - Auto-applied outcomes show "Marked rejected from this email" with Undo.
  - **Right:** the next step card (same button as the row), the existing "What happened?" outcome
    chips (`outcome-chips.tsx`) for recording an outcome by hand, follow-up controls, and the facts
    list:
    - Posted: the date, labelled as the original posting or the latest publication.
    - Applied: the date and the number of days after posting, in India calendar days.
    - Resume: the exact version used.
    - Source, city.
    - An **Edit details** link to `/applications/<id>`.
- `/applications/<id>` remains the edit page for resume, URL, notes and rounds. Its read-only
  history duplicates the story, so the builder may trim it to the edit forms plus a link back to
  `/applications?open=<id>`.

## 6. Cleanup after the new page ships

The user asked to delete stale code once the fixes land. Before deleting, list every file and
export to the user. Expected candidates:

- `src/features/applications/views/lanes.tsx`, `lane-detail.tsx`, `lane-marks.tsx`,
  `timeline.tsx`, `marks.tsx` (if unused), and the chart-only parts of `lanes.ts`: `laneWindow`,
  `laneViews`, `stackDots`, `laneDots` and their view types. Keep the grouping and next-step logic
  that Mail and Companies still use.
- The `?emails=1` and `?tab=emails` redirect in `src/app/applications/page.tsx`, if nothing links
  to it any more.
- Old galleries for superseded Applications designs: `/gallery/applications`,
  `/gallery/applications/timeline` and their `src/features/applications/gallery/` code, and the
  Applications option in `src/features/mail/feed-gallery/`. Keep the gallery for this design
  (`/gallery/applications-sync`) until the user signs off, then ask about it.
- Tests that only cover deleted code. Update AGENTS.md product-scope notes that point at removed
  galleries or the calendar lanes.

## 7. Testing

- **Unit:**
  - The eligibility rule: one versus two live applications, previous job, closed application,
    email before the sent day, already referenced, outcome not allowed.
  - Tag-to-effect mapping, journey step derivation, grouping and ordering.
- **Integration** (`npm run test:db` against `jobops_e2e` only):
  - Ingest, include, place and retag each auto-apply.
  - Recovered history mail follows section 1.
  - Undo restores status, closed reason and job status, and the email is not re-applied.
  - The catch-up script is idempotent (running it twice changes nothing).
- **Browser** (port 3211, `jobops_e2e`):
  - A rejection fetched for a single-application company shows Rejected on Applications, Mail's
    rail and the company page.
  - An assessment email asks on its row and records with a date.
  - A row expands and collapses; deep links open the right row.
- Never point tests at personal data.

## Left to the builder

- Function and file names, and whether the auto rule lives in `features/mail` or
  `features/applications`.
- Whether the catch-up runs as a migration step or a one-off script, as long as it is idempotent
  and documented.
- Exact spacing and type sizes, within the gallery's look and the existing tokens.
- How much of `/applications/<id>` to trim, as long as editing still works and nothing is lost.
- Whether Closed starts collapsed and above what count.
