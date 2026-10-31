# Job mail feed, transparent company search and per-application mail — design

Status: approved 2026-10-31, with the gallery picks below.

## Picks from the live gallery (`/gallery/mail-search`, 2026-10-31)

| Section                      | Pick | What it means                                                                                                    |
| ---------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| Tag colours                  | B    | Colour by stage: five families (before applying, applied, interviewing, offer and joining, rejected) plus grey Other; icon and words name the kind. |
| Job-mail feed                | B    | Two lines with a preview: company and sender on top, tag pill and subject below, then the first line of the email. |
| What needs you soon          | A    | A "Coming up" strip of cards above the feed, sorted by due date, deadline as the headline; scrolls sideways on a phone. |
| Company status               | A    | A tonal status pill with one line of detail; previous employers get their own badge.                             |
| Company search panel         | C    | Rules as rows (addresses, domains, names and keywords, never include, inboxes, time frame), each showing how many emails it kept last search, plus the last search summary. |
| Watching a search run        | B    | One lane per inbox, side by side (stacked on a phone), each with its state, counts, exact search and its own results streaming in. |
| Fetch new mail               | A    | The button with "Since last fetch / Last N days" beside it, always visible, the coverage sentence under it, then per-inbox progress. |
| Applications                 | C    | One lane per application on a four-week calendar with a Today line: emails placed by date as tag icons, applied dot, and dashed rings for what's due; pressing an email shows it below. Previous jobs in a collapsed list under the lanes. |

The gallery stays at `/gallery/mail-search` as the record of these picks. The colour-by-stage pairs move from the gallery into `globals.css` as `--tag-*` tokens.
Revises `2026-10-30-shared-mail-foundation-design.md` (§2 fetch window, §4 removal of company and provider search) and `2026-10-31-company-timeline-design.md` (§4 tags, §5 Mail view). Replaces the direction of piece 3 ("Applications lane previews").

## Why

The user, 2026-10-31, after using the company-timeline release:

- Per-company email search is gone. There is no way to see what is being searched, with which keywords, in which inbox, or why an email was kept or dropped.
- "Check mail" is vague: it says nothing about what it covers.
- Recently applied jobs have no emails on their timelines.
- They want the status of every company, including previous jobs, and every job email in one newest-first place with colour tags, with what needs attention soon highlighted.

### What the data showed (personal database, 2026-10-31)

Three separate causes, all confirmed:

1. **Never fetched.** Check mail starts at `mailMonitorStartedAt` (2026-10-30 09:36 UTC) and only moves forward. Applications to Level AI, Weave, APEXX and Oracle (3 Oct) and ServiceNow (28 Oct) predate it, so their confirmations were never pulled. Only 26 emails between 1 Sep and 25 Oct are in the ledger at all, left over from the retired company search.
2. **Fetched, then dropped by the sorter.** "Thank you for your application to Oracle" (30 Oct, `noreply@oracle.com`) matched Oracle by subject, but `classifier.ts` knows "thanks for your application" and not "thank you for your application". The email became `UNKNOWN`, `evaluateCompanyMail` returned "Company match without a job-search event", and `matchMail` reported the generic "No hiring update matched a saved company…".
3. **Previous-job mail dropped the same way.** Amazon interview confirmations and onsite feedback (2021) and First Advantage background-verification emails (2021–22) were fetched and dropped. There is no background-check category, and "Interview – CONFIRMATION" matches no interview phrase.

255 of the 309 dropped identities carry the same generic reason, so none of this was visible.

## Goals

1. **One job-mail feed.** Every job email from all inboxes in one newest-first list with colour tags. Spam, promotions, digests and LinkedIn networking never appear.
2. **Attention first.** Emails that need the user, and anything due soon, are highlighted above the feed.
3. **A clear status for every company**, the same everywhere, including previous jobs.
4. **Transparent company search.** Each company page shows exactly how its mail is found, lets the user edit it, and runs it over a chosen time frame with live per-inbox progress and a reason for every dropped email.
5. **Honest fetching.** The main fetch says what it covers and can reach back N days instead of only "since last fetch".
6. **Per-application mail.** Applications groups the same emails by application (role or outreach record).
7. **A sorter that recognises real job mail**, including the phrasings and categories above.

## Non-goals

- No LLM calls, no sending or replying, no scheduled or background fetches.
- No rendering of HTML email.
- No raw provider operators, regular expressions or exact date ranges typed by the user. Search terms are literal phrases.
- No automatic creation of companies or applications from mail.

## Anti-goals (failure even if it technically works)

- **Silent filtering.** Every dropped email must be explainable on request, with the specific step that dropped it.
- **Old mail reappearing as new** after a re-search, a rule change, a folder move or a longer time frame.
- **Spam or promotions in the feed.**
- **Invented facts:** statuses, dates or links that were not recorded or sourced.

## 1. Categories (tags)

Tags stay derived from `mail_messages.classification` (`tags.ts`); there is still no tag column.

| Tag                         | Classifications                             | Meaning                                                                |
| --------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| **Application**             | `APPLICATION_ACKNOWLEDGEMENT`, `FOLLOW_UP`  | Received, submitted, status updates about an application               |
| **Referral**                | `REFERRAL` (new)                            | Referral submitted, received or requested by someone the user contacted |
| **Interview call**          | `INTERVIEW`, `ASSESSMENT`                   | An invitation or scheduling for a round, including an OA               |
| **Interview process**       | `INTERVIEW_UPDATE` (new)                    | Confirmations, reschedules, prep material, feedback, next steps        |
| **Offer**                   | `OFFER`                                     | Offer letters and offer discussions                                    |
| **Rejection**               | `REJECTION`                                 | Not selected, not moving forward                                       |
| **Background verification** | `BACKGROUND_CHECK` (new)                    | BGV requests and reminders (First Advantage, HireRight, AuthBridge…)   |
| **Joining**                 | `ONBOARDING` (new)                          | Joining date, onboarding, pre-joining formalities, first-day details   |
| **Opportunity**             | `RECRUITER_OUTREACH`                        | A recruiter reaching out about a role (my call; see Decisions)         |
| **Other**                   | `UNKNOWN`                                   | Job mail kept for a company that the sorter could not categorise       |

- Add the four classifications to `mailClassifications` and the Postgres enum (`ALTER TYPE … ADD VALUE`).
- Each tag gets a Material tonal pair (`--tag-<id>` and `--tag-<id>-container`) in `globals.css`, light and dark. Exact colours are picked in the gallery; avoid cyan, brown, beige and green-tinted surfaces per the colour preference.
- Retagging keeps working through `PATCH /api/v1/mail/{id}` with the new tag ids. Old tag ids (`process`, `rejected`, `opportunity`, `offer`, `other`) are accepted and mapped for one release so agent scripts do not break.

## 2. Sorter fixes

In `src/services/mail/classifier.ts` and `src/features/mail/matching.ts`:

- **New phrases**, at least: "thank you for your application", "thank you for your interest in", "your application (to|for)", "application submitted"; "interview confirmation", "interview – confirmation", "on-site/onsite interview", "interview preparation", "interview feedback", "next round"; "background (check|screen|screening|verification)", "employment verification", BGV vendor sender domains (`fadv.com`, `hireright.com`, `authbridge.com`); "date of joining", "joining date", "onboarding", "pre-joining", "welcome aboard", "your first day"; "referred you", "you've been referred", "referral (submitted|received)".
- Fixtures for the unit tests are shaped on the real dropped emails listed above, anonymised.
- **Company match with hiring words but no recognised event** is kept as Other instead of dropped, when the company evidence is a sender address, a sender domain or a company keyword. Company-name-in-subject alone still needs an event (it protects against "Amazon Sale" style mail; the digest/promo rules still run first).
- **Specific reasons.** When a company matched but a later step dropped the email, the ledger stores that step's reason and the company key ("Matched Oracle by subject; no job event recognised"), not the generic "No hiring update matched…". `mail_tracking.company_keys` is filled for excluded rows too.
- **Re-deciding dropped mail.** A ledger identity with `disposition = 'excluded'` is re-evaluated when a fetch or search sees it again, because rules may have changed. If it is now kept, it is imported and the ledger row flips to `kept`. A `kept` identity is still never re-imported or reopened.

## 3. Company status

One derived status per company, shown as a pill on the Mail rail, the company page header, the Companies list and Applications. It is never hand-picked.

- Built from the company's applications with the existing `recordStatus` / `laneStatus` tones (preparing, applied, quiet, interviewing, offer, closed), plus:
  - **Accepted**: a current application closed with reason `ACCEPTED` through the normal outcome flow. Its background-verification and joining mail still counts toward Needs you, because it has real deadlines.
  - **Mail only**: job mail but no application record.
- **Previous jobs are only records made with "Add previous job"**, marked by their own `source` value (`PREVIOUS_JOB`). Accepting a current offer never makes a previous job.
- A company with a previous job keeps a separate **Previous employer** badge ("Joined 2022") beside its live status, so re-applying later shows both.
- Previous jobs never count toward Needs you, silence clocks or the 14-day freshness rule.

### Recording a previous job

- **Previous employers may have a company record outside the shortlist policy** (user, 2026-10-31). Such a record is marked as a previous employer and is hidden from the shortlist views (Companies Compare, Grid and Pipeline) unless it separately qualifies under the ₹15 LPA policy. It still gets a company page, a Mail rail row under Previous employers, and company search.
  - Entry points: "Add previous job" on an existing company page, and "Add a previous employer" on Companies, which asks for the company name as well and creates the record. The builder chooses how the marker is stored.
- "Add previous job" asks for role title and joined month (required), left month and notes (optional). Nothing is guessed.
- It creates an application record with `source = PREVIOUS_JOB`, closed as `ACCEPTED`. `appliedAt` and `postedAt` stay empty: they mean the application and posting dates, and those are unknown. Joined and left months are stored as application events (for example `JOINED` with `{ joinedOn, leftOn }`).
- `jobs.canonical_url` is required today. The builder chooses how a previous job satisfies it (for example an internal `jobops:previous/<id>` key) without pretending it is a real posting URL.
- Previous-job job rows are filtered out of everything that treats jobs as openings: Home's openings and activity chart, Companies' saved openings, and the `GET /api/v1/applications` duplicate check. This is a filter only; it is the one Home change this work makes.
- **Auto-linking:** company mail tagged Offer, Background verification or Joining links to the previous job only when the company has no open application and the email arrived before the end of the month after the joined month. Anything else uses the normal "Which role?" link.
- When a previous job is added, the company's existing mail that meets that rule is linked at once, and the confirmation says how many ("Linked 7 emails").

## 4. The job-mail feed (`/mail`)

- **Default view: All job mail.** Every kept email from every company and Needs a home, newest first, grouped by India date (the existing day ledger).
- **Coming up and needs you,** above the feed: open emails plus booked rounds and OA deadlines within the next 7 days (`HORIZON_DAYS`), soonest first. Exact presentation is a gallery pick.
- **Rows:** tag pill, company (linking to its page), sender, subject, time, and a quiet source chip with the inbox and folder ("Outlook · Junk", "Gmail · Inbox"). Rows open in place as today; handling stays as in the company timeline spec (§3).
- **Tag pills** with counts filter the feed, one at a time, as today but with the new tags.
- **Company rail** stays beside the feed: "All job mail" at the top, then companies with their status pill, grouped as now (Needs you, Waiting on them, Closed, Needs a home), with Previous employers as its own collapsed group. Choosing a company narrows the feed to it and shows a link to its search panel.
- Search of fetched mail (`q`) stays.
- URL: the existing parameters keep working; no `company` means All job mail.

## 5. Fetching new mail

The "Check mail" button becomes **Fetch new mail**, with what it covers stated beside it.

- **Coverage line,** always visible: the inboxes ("Gmail, Outlook ×2"), "all folders incl. Spam and Trash", and the window ("since 31 Oct, 2:14 pm").
- **Time frame:** "Since last fetch" (default) or "Last N days" with a number field. N is a whole number from 1 to 180; a day is 24 elapsed hours, resolved once into explicit bounds when the fetch starts.
  - The main fetch reads every message in every folder, so it is capped at 180 days. Older mail is reached through company search (§6), which sends a targeted query and allows up to 3650 days. The field says so when the cap is hit.
  - A Last N days fetch starts at the earlier of `now − N days` and the account's last fetch, so it never leaves a gap; the coverage line names the actual start. When it completes, the account's last fetch becomes the fetch's end, as a normal fetch would.
  - Already kept identities are skipped; dropped identities are re-decided (§2).
- **Live progress** per inbox while it runs: queued, fetching page n, done or failed, with fetched / kept / dropped / already-tracked counts. The finished summary names what changed ("4 kept, 2 need you, 37 dropped — view dropped").
- **View dropped** lists the run's dropped emails with their specific reason and an **Include this** action (§6).
- `POST /api/v1/mail/check` accepts optional `{ lastDays }` and returns the same per-account counts.
- **Recovered mail** (received before the account's previous last fetch) enters handled, so it appears in date order without flooding Needs you. Mail received after the previous last fetch starts open, as today.

## 6. Company search panel ("How we find <Company>'s mail")

On the company page Timeline tab, as a section of the aside. `/mail` links to it when a company is selected; the old "Mail rule" drawer is folded into it.

### What it shows and edits

The panel reads and writes the existing company rule (`ruleSchema`, stored at `mailRule:<hash>`).

- **Email addresses** (`senders`): chips with remove; an "Add an address" field. Suggestions offer sender addresses already seen in this company's kept mail.
- **Domains** (`domains`): chips with remove and add.
- **Keywords**: the company name (fixed) and aliases, plus recruiter keywords such as "Oracle Talent Acquisition" or "OCI Recruiting": chips that can be edited in place, removed or added.
  - A new `keywords` field replaces `subjectTerms`. A keyword matches the subject or the sender's display name (which catches applicant-tracking mail such as "Level AI Hiring Team" via Ashby); it does not match the body.
  - Generic job words on their own ("application", "interview", "job", "hiring", "recruiter", "careers", "offer" and similar) are refused as keywords with a one-line reason, because they would claim every company's mail.
  - The narrowing "Subject must include" filter goes away; "Never include" is the only narrowing tool. No saved company rules exist on the personal database today (verified 2026-10-31), so nothing needs migrating; a saved `subjectTerms` value, if one appears, is shown as keywords for the user to review.
- **Never include** (`excludedTerms`): collapsed by default; same chip editing.
- **Inboxes**: each connected account with a checkbox (all by default), and the folder scope ("All folders incl. Spam/Junk and Trash; Sent and Drafts used only to follow threads").
- **Time frame**: "Since last search (31 Oct)" or "Last N days" (1–3650, default 90 on a company never searched).
- **Rule source line**: "Your saved rule" or "Built from the company name, aliases and website", as today.

Edits save immediately (with a quiet "Saved") and apply to the next fetch and search. They never re-hide kept mail.

### What a search does

- One provider query per selected inbox, built from the rule: any of sender address, sender domain, company name or alias in the subject, or a keyword phrase anywhere, within the time frame. Gmail uses `q` (with `-in:sent -in:drafts` and second-precision bounds); Outlook uses Graph `$search` KQL with a widened day window and exact bounds enforced locally — as the retired `search-query.ts` did. Terms are quoted literal phrases; quotes, backslashes and control characters are rejected.
- Every fetched email goes through the same sorter and matching as a fetch, with keyword hits counting as company evidence.
- Results are stored exactly like fetched mail: kept emails become `mail_messages` rows for the company; every identity is recorded in the ledger. Nothing found by a search can come back as new later.
- Execution follows Check mail: page-sized steps per account under the existing connection lock, a saved cursor per company and account, the browser looping steps, and an interruption resuming on the next press.

### Live run view

- One row per inbox: state (queued, searching page n, done, failed with a reconnect hint), the exact query sent (monospace, expandable), and fetched / kept / dropped / already-tracked counts updating per page.
- Results stream in below, newest first: kept emails with their tag, and dropped emails with their specific reason.
- **Include this** on a dropped email keeps it for this company (tagged by the sorter, Other if unknown), flips its ledger row to kept, and adds its sender address to the company's addresses so future fetches keep that sender. The panel says so ("Added careers@oracle.com to Oracle's addresses").
  - A **shared sender** is never added: personal mail domains, applicant-tracking systems (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS), job portals (Naukri, Instahyre, Cutshort, Hirist, LinkedIn) and BGV vendors. The list extends `blockedDefaults` in `context.ts`. The panel keeps the email and says why the sender was not added, offering the sender's display name as a keyword instead ("Add 'Level AI Hiring Team' as a keyword").
- **Last run summary** persists: when, which window and inboxes, and the counts. The last run's dropped list survives a reload, read from ledger rows with this company key and run time.

### API (LAN-trusted, like `/api/v1/companies`)

- `GET /api/v1/mail/company/{key}/search` returns the rule, inbox scope, the last run summary and the queries that would be sent.
- `POST /api/v1/mail/company/{key}/search` with `{ lastDays?, accounts? }` runs one step and returns per-account state, counts, queries and the page's kept and dropped items.
- `PUT /api/v1/mail/company/{key}/rule` replaces the rule (validated by `ruleSchema`).
- `POST /api/v1/mail/{trackingId}/include` with `{ company }` performs Include this.

## 7. Applications: one group per application

The same emails, grouped by application instead of by company.

- `/applications` shows one group per application (each role, and each outreach record). This replaces one lane per company.
- Each group: company, role, method, status pill, next step and due label, and its linked emails newest first with tag pills, latest few shown and the rest behind "n more". Needs-you emails are highlighted as on Mail.
- Order: the existing queue urgency, then recent activity. Previous jobs sit in a collapsed group at the end.
- The application page shows its full timeline with the `role` filter fixed to that application.
- Emails the matcher suggests for an application but that are not linked yet (`suggestedApplicationId`) appear in that application's group with a one-click Link, as today's lanes do, so new mail for a recent application shows up on Applications straight away.
- Company mail with no suggested application shows on the company page as "Not linked to a role" with the existing "Which role?" control; it does not appear on Applications until linked.
- Referral emails attach to the outreach record of the person contacted, through the existing outbound-contact matching.
- Layout (list of groups or calendar lanes per application) is a gallery pick.

## 8. Gallery before build

A live gallery at `/gallery/mail-search` in the Docker app, using sample data and no mailbox requests, with two or three interactive options each for:

1. Feed row and tag pills (with the ten tags in light and dark).
2. Coming up / needs-you highlight.
3. Company status pill and Previous employer badge.
4. Company search panel (rule chips, inboxes, time frame).
5. Live run view (per-inbox rows, query reveal, streaming kept/dropped with Include this).
6. Fetch new mail control with coverage line and Last N days.
7. Applications per-application group.

The user picks; this document is then updated with the picks before the implementation plan.

## 9. Data and migration

- Add the four classification values to the enum. No columns are dropped.
- Store the company search cursor and last run summary in `settings` (`companySearch:<key>:<connectionId>` and `companySearchRun:<key>`).
- No backfill migration re-decides old mail: the user's first Last N days fetch or company search does it, visibly.
- Before running the enum migration on personal data, take a private backup in `backups/` (never committed).

## 10. Testing

- **Unit:** each new phrase and category, using fixtures shaped on the real dropped emails; the Other rule; specific drop reasons; tag mapping and old-id compatibility; Gmail and Outlook query building and term validation; Last N days bound resolution; recovered-mail attention.
- **Integration (`jobops_e2e` only, synthetic providers):** company search storing kept mail and ledger rows; re-deciding an excluded identity; a kept identity never reopening; Include this adding the sender; Last N days fetch moving the checkpoint; previous-job record and auto-linking; per-application grouping query.
- **Browser (port 3211):** editing chips and the time frame; a run with live per-inbox progress and Include this; Fetch new mail with Last N days; the feed with tag filters and the highlight; Applications groups; Add previous job; phone width with no horizontal scroll; light and dark.

## Decisions to confirm (my calls)

1. **Opportunity stays as a tag** for recruiter outreach, which is in none of the user's eight categories but is 33 of the 60 kept emails.
2. **An OA invite is an Interview call,** not Interview process.
3. **Recovered older mail enters handled,** so a long Last N days fetch never floods Needs you.
4. **Keywords widen the search** (OR with addresses, domains and names) and count as company evidence. They match subject and sender name only, and generic job words are refused.
5. **Company-matched mail with hiring words but no recognised event is kept as Other** when matched by address, domain or keyword.
6. **The search panel lives on the company page aside,** reached from `/mail` by a link, rather than inside `/mail`.
7. **No exact date range or "all history" option.** Company search's Last N days goes up to 3650.
8. **The main fetch's Last N days is capped at 180 days,** because it reads every message; older mail goes through company search.
9. **Previous jobs are only "Add previous job" records,** so accepting a current offer keeps its BGV and joining mail in Needs you.
10. **Include this never adds a shared sender** (ATS, portals, personal mail, BGV vendors) and offers a keyword instead.
11. **Suggested-but-unlinked mail shows in its application group** with a one-click Link.

Decided by the user: previous employers may have company records outside the shortlist policy (§3).

## Out of scope

Scheduled fetches, sending mail, LLM reading of email, HTML rendering, automatic application creation from mail, Home changes, and Gmail/Outlook label writes.
