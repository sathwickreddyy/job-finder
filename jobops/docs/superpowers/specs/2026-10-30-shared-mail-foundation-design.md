# Shared mail foundation and agent record APIs — design

Status: approved 2026-10-30; implemented on branch `shared-mail-foundation` (plan `jobops/docs/superpowers/plans/2026-10-30-shared-mail-foundation.md`). Attention is stored as `OPEN`/`DONE` and serialized as `open`/`handled`.
Piece 1 of 4 in the connected workspace redesign. Supersedes the history-recovery, Latest/History/Excluded and provider-search parts of `2026-10-30-company-mail-workspace-design.md`.

## Why

Home, Companies, Applications and Mail drift apart because mail has four fetch paths (inbox refresh, workspace scan, company search, provider search) and "handled" is stored in three places (`mail_messages.attention_state`, `mail_events.status`, `mail_tracking.disposition`). The UI also asks the user to understand Latest, History, Excluded, Check mail, Search inboxes and Find older mail. This piece leaves one email record, one attention flag and one fetch path, and adds the APIs the user's daily agent routine needs.

## Product principles (user, 2026-10-30)

- Premium, calm and high-value for a busy person applying to many jobs. Nothing is added that does not earn its place.
- Every tab reads the same records. Every email has the same structure. Excluded mail is never shown.
- Mail is fetched on demand, from each account's last fetch to now. No schedule and no history recovery for now.
- Codex or Claude applies in the browser while the user watches and approves Submit. JobOps APIs only record what happened; they never apply, submit or send.

## Programme

1. **Shared foundation (this spec):** email record, tags, attention, on-demand Check mail, mail and application-record APIs, cleanup and migration, stopgap mail UI.
2. **Company timeline:** a redesigned company page and Mail view sharing one ordered timeline component. Already decided in the visual companion: the Mail rail has one row per company, grouped Needs you / Waiting on them (7-day application and 5-day outreach silence) / Closed / Needs a home. New mail is handled with outcome chips: a suggested chip, one click records the outcome with the email as its source, and "Just info" only clears attention. It adds colour-tag filters and search of fetched mail. A live component gallery comes before the build.
3. **Applications connections:** lane previews of applications and their emails, company links and the same needs-you signal.
4. **Home:** metrics, analytics and a streak from real recorded activity, plus a needs-you entry point. The streak is defined in that piece's spec.

Each piece gets its own spec, plan and build.

## 1. Email record, tags and attention

- `mail_messages` is the only visible email record, read by Mail, company pages, the Applications drawer, `/mail/<id>`, Home and the API through one serializer.
  - Add nullable `company_key` (text) and `folders` (text array), backfilled from the ledger.
  - The serialized `MailItem` shape is `{ id, account, provider, folders, receivedAt, sender, senderName, subject, text, company: {key, name} | null, application: {id, role} | null, tag, kind, attention, handledAt, outcome }`.
  - `text` is the plain-text body, falling back to the snippet. HTML is never rendered for spam or junk.
- `mail_tracking` stays internal as the per-account identity ledger. `disposition` becomes `kept | excluded`. Excluded identities never get a visible record but stay in the ledger, so they are never re-imported.
- Tags are derived from `classification`; there is no new column.

  | Tag           | Colour | Classifications                                                       |
  | ------------- | ------ | --------------------------------------------------------------------- |
  | `opportunity` | blue   | `RECRUITER_OUTREACH`                                                  |
  | `process`     | yellow | `APPLICATION_ACKNOWLEDGEMENT`, `FOLLOW_UP`, `ASSESSMENT`, `INTERVIEW` |
  | `offer`       | green  | `OFFER`                                                               |
  | `rejected`    | red    | `REJECTION`                                                           |
  | `other`       | grey   | `UNKNOWN`                                                             |
  - `kind` keeps the finer label (Interview, Assessment, ...). Exact colours are chosen in piece 2's gallery.
  - Retagging writes `classification`. A process tag keeps an existing process classification, otherwise it uses `FOLLOW_UP`. Retagging also writes an activity log.

- `attention_state` is the single handled flag: `OPEN` or `HANDLED`, with `processed_at` as the handled time.
  - Every email kept by a check after cutover starts `OPEN`, whatever its tag.
  - Only an outcome (UI chip or API) or "Just info" sets `HANDLED`.
  - `mail_events.status` and the ledger disposition no longer drive any screen.
- Cutover: every existing email becomes `HANDLED` and stays visible on its company timeline.

## 2. Check mail (on demand)

- Triggers: the Check mail button and `POST /api/v1/mail/check` only. No timer and no background runner.
- One service replaces the four fetch paths. It is rebuilt from `scan-service`'s latest mode, reusing provider adapters, folder discovery, connection locks, the ledger and matching.
- Window per account: from its last complete fetch minus a one-hour overlap, up to a bound fixed when the check starts.
  - It covers every incoming folder and label, including Spam/Junk and Trash. Sent and draft mail are context only and never become new mail.
  - Each account resumes from its existing latest-scan checkpoint. An account never fetched starts at release.
- Execution: short page-sized steps with saved checkpoints, as today.
  - The button loops steps and shows progress ("Checking 3 inboxes…", "2 new need attention"). An interruption resumes on the next press.
  - The API runs one step per call and reports `more`.
- Failures:
  - One account's error (for example an expired token) never blocks others. It is stored on `mail_connections.last_error` and shown as a single Reconnect notice.
  - An account's last-fetch time advances only when all its folders complete.
- "Last checked" comes from `mail_connections.last_synced_at`. "Needs attention" is a count of `OPEN` emails. No run-log table.

## 3. Agent APIs

All new routes sit behind the existing `/api/v1/companies` guard in `src/proxy.ts`: local host/network only, no `next-action`, and origin checks. No new credentials. Mailbox access stays read-only.

### Mail

- `POST /api/v1/mail/check` runs one step across all accounts.
  - Returns `{ more, newAttention, accounts: [{ account, provider, status: "done" | "more" | "failed", error, lastFetchedAt }] }`.
- `GET /api/v1/mail` lists `MailItem`s, newest first.
  - Filters: `attention=open|all` (default all), `tag`, `company`, `application`, and `q` (subject, sender and text).
  - Paging: `cursor`, with 50 items per page.
  - Excluded mail is never returned.
- `POST /api/v1/mail/{id}/handle` takes either form:
  - `{ outcome, applicationId?, details? }` records an outcome through the existing outcome service with the email as its source, then sets `HANDLED`. `outcome` uses the ids in `applications/phase.ts`. `applicationId` is required only when the company has more than one open application.
  - `{ justInfo: true }` only sets `HANDLED`.
- `PATCH /api/v1/mail/{id}` accepts `{ tag?, company?, application? }` for retagging or placing an email the check could not match.

### Applications (record only)

- `GET /api/v1/applications?url=…|company=…` returns existing records for a duplicate check before the agent starts applying.
- `GET /api/v1/resumes` lists resume files `{ id, family, label, isCurrent }`, so a record keeps the exact file submitted.
- `POST /api/v1/applications` takes three parts:
  - **`opening`:** `{ url, company, title, location?, description?, postedAt?, postedAtKind?: "original" | "latest_publication", postedAtSourceUrl? }`. It is created or matched by canonical URL using the existing job normalisation.
  - **`application`:** `{ method: "DIRECT" | "REFERRAL" | "COLD_EMAIL" | "LINKEDIN_MESSAGE", submittedAt?, resumeVersionId?, confirmationUrl?, notes?, recipient? }`.
  - **`humanConfirmed`:** must be `true`.
- The record goes through the same code as Record as sent (extracted from `tracking-actions.ts` into a shared service), so it appears at once on Applications, company pages and Home.
- An existing record for the same opening and method returns `duplicate: true` instead of a second record.
- Response: `{ id, duplicate, links: { application, company }, warnings }`.
  - `warnings` cover an unknown posting date, a posting date more than 14 calendar days old (Asia/Kolkata), and a missing resume file.
  - Warnings never block recording.
  - Unknown dates stay unknown; discovery dates are never substituted.
- Schema: add `jobs.posted_at_kind` (`ORIGINAL | LATEST_PUBLICATION`, nullable) and `jobs.posted_at_source_url` (nullable). The project's tracking rules require this provenance, and nothing stores it today.

## 4. Cleanup, migration and stopgap UI

### Delete

- Company search: `company-search.ts`, `/api/v1/mail/company/search`, `history-search-panel.tsx`, and the `company_mail_matches` table.
- Provider search: `search-service`, `search-contract`, `search-state`, `search-http`, `search-preview`, `/api/v1/mail/search`, the `/mail/search` page, `search-workspace.tsx` and `/gallery/mail/search`.
  - Company rule types move out of `search-policy.ts` before it is removed.
- The history scan mode and "Find older mail".
- `refresh-service.ts`, which has no callers left.
- Latest/History/Excluded views and counts.

### Keep

Provider adapters, OAuth connections, folder discovery, matching, editable company patterns, the ledger and the outcome service. The Applications emails drawer and `/mail/<id>` switch to the shared record and `attention_state`.

### Migration on personal data

Make a fresh private backup in `backups/` (never committed), then:

1. Backfill `company_key` and `folders` onto every kept email.
2. Collapse the ledger to `kept | excluded`.
3. Set every existing email to `HANDLED`.
4. Keep each account's existing checkpoint as its last fetch.
5. Drop `company_mail_matches` and the history and company-search checkpoints in `settings`.
6. Add the two `jobs` columns.

Rehearse on a scratch database restored from the backup, compare counts, then run on the real database only after the user says go.

### Stopgap mail UI until piece 2

- `/mail` keeps its layout with two filters, Needs attention and All mail.
- Rows show their tag colour.
- "Mark reviewed" becomes "Just info".
- Saved-mail search and Check mail keep working.

## 5. Testing

- **Unit:** tag mapping, attention transitions, `MailItem` serializer parity between UI and API, request validation for every endpoint, duplicate detection, the 14-day Asia/Kolkata freshness warning, unknown-date handling and `humanConfirmed`.
- **Integration** (marked `jobops_e2e` database, synthetic providers):
  - all-folder coverage including Spam and Trash
  - overlap and folder-move deduplication
  - separate accounts sharing an Internet Message-ID
  - failure isolation and checkpoint advance only on completion
  - excluded mail never visible
  - handling from Mail, drawer and API writing the same flag
  - outcome-from-mail source linking
  - the migration on a seeded copy

  Integration files run serially, which fixes the shared-database clash seen on 2026-10-30.

- **API:** route tests per endpoint, following `tests/mail-search-api.test.ts`.
- **Browser** (Playwright, port 3211): Check mail, then Needs attention, then Just info; and agent recording appearing on Applications and the company page.
- **Release:** migration rehearsal with count comparison; typecheck, lint, full suite and Docker production build. Manual review of `/mail` and Applications without triggering a real mail check unless the user asks.

## Out of scope

Scheduled scans, history recovery, custom date ranges, provider-side search, applying or submitting through any API, sending mail, internal LLM calls, and the visual redesign (pieces 2–4).
