# Shared Mail Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leave JobOps with one email record, one attention flag, one on-demand mail check and record-only agent APIs, so Home, Companies, Applications and Mail can read the same data.

**Architecture:** `mail_messages` becomes the only visible email record (plus `company_key` and `folders`). `mail_tracking` stays as the internal identity ledger, reduced to `kept | excluded`. One `check-service` replaces the scan, company-search, provider-search and refresh paths. One `MailItem` serializer feeds both the `/mail` page and `/api/v1/mail`. Agent routes reuse the existing outcome service and an extracted record-as-sent service.

**Tech Stack:** Next.js 16 App Router, React 19, PostgreSQL + Drizzle 0.45, zod 4, vitest, Playwright, Tailwind 4 tokens.

**Spec:** `jobops/docs/superpowers/specs/2026-10-30-shared-mail-foundation-design.md`

## Global Constraints

- All paths below are relative to `jobops/`. Run commands from `jobops/`.
- Work on branch `shared-mail-foundation`, created from `main` in this checkout (no worktree: `.env` and `node_modules` live here). Do not push.
- Commit after each task as `JOB_FINDER-9999: <summary>`, with the footer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Personal database:** never run `docker compose up`, `npm run db:migrate` or any write against the personal database (`DATABASE_URL` in `.env`). The Docker entrypoint applies migrations on start, so the app container is not restarted until the user says go (Task 8). `docker compose build` is allowed.
- **Integration tests** run only against `jobops_e2e` through `npm run test:db -- <files>` (added in Task 2). That script migrates `jobops_e2e` and runs files serially. Each integration file guards with `assertE2eDatabase()`.
- No LLM calls. No mail sending. Mailbox access stays read-only. No API applies, submits or sends anything.
- **Attention:** the stored values stay `OPEN` and `DONE`. The spec's `HANDLED` is the serialized value `attention: "handled"`; `OPEN` serializes as `"open"`.
- Two existing actions on Applications lanes and on `/mail/<id>` keep handling the email: "Link" records `MAIL_LINKED` or `ACKNOWLEDGEMENT_RECEIVED`, and "Dismiss" works as Just info. Placing an email (company or application) never changes attention.
- No reader or serializer exposes `bodyHtml`; mail is shown as plain text only.
- **Tags** are derived from `classification`, never stored:

  | Tag           | Label                   | Classifications                                                       |
  | ------------- | ----------------------- | --------------------------------------------------------------------- |
  | `opportunity` | Job opportunity         | `RECRUITER_OUTREACH`                                                  |
  | `process`     | Application / interview | `APPLICATION_ACKNOWLEDGEMENT`, `FOLLOW_UP`, `ASSESSMENT`, `INTERVIEW` |
  | `offer`       | Offer                   | `OFFER`                                                               |
  | `rejected`    | Rejected                | `REJECTION`                                                           |
  | `other`       | Other                   | `UNKNOWN`                                                             |

- Excluded mail is never returned by any reader: any message whose ledger row is `excluded` is hidden.
- Mail list page size is 50. Agent JSON bodies are limited to 64 KiB.
- An open application has a status other than `REJECTED`, `WITHDRAWN` or `CLOSED`.
- Dates for freshness and sent dates use Asia/Kolkata calendar days. An unknown `postedAt` stays null; it is never replaced by a discovery date.
- UI copy: "Needs attention", "All mail", "Just info", "Check mail", "Reconnect". Colours come from theme tokens in `src/app/globals.css`; no palette literals in components.

## Review Focus

1. **A check interrupted mid-window, then resumed after a company rule edit.** It must resume the same window and neither skip nor re-import mail. Test: Task 4, `resumes an incomplete check after a rule edit`.
2. **An agent posting the same application twice at once.** The result must be one record and one `duplicate: true`. Test: Task 6, `concurrent duplicate posts create one record`.
3. **A legacy message whose ledger row was later excluded.** It must not appear in lists, counts or the API. Test: Task 3, `hides messages whose ledger row is excluded`.
4. **Posting dates near midnight in India.** The 14-day warning must use Kolkata dates, not UTC. Test: Task 6, `freshness uses Asia/Kolkata calendar days`.
5. **Handling an email a second time** (UI and agent racing). The second call must return 409 and must not add a second outcome event. Test: Task 5, `a second outcome on a handled email is refused`.

---

### Task 1: Retire provider search, company search and the history entry points

**Files:**

- Delete:
  - `src/features/mail/search-service.ts` and `search-service.test.ts`
  - `src/features/mail/search-contract.ts`, `search-state.ts`, `search-state.test.ts`, `search-http.ts`, `search-preview.ts`, `search-workspace.tsx`
  - `src/features/mail/company-search.ts`, `company-search-policy.ts`, `company-search-policy.test.ts`, `history-search-panel.tsx`
  - `src/features/applications/views/mail-sections.tsx` (imported nowhere)
  - `src/app/api/v1/mail/search/route.ts`, `src/app/api/v1/mail/company/search/route.ts`, `src/app/mail/search/page.tsx`, `src/app/gallery/mail/search/page.tsx`
  - `tests/mail-search-api.test.ts`, `tests/company-mail-persistence.integration.test.ts`, `tests/e2e/company-mail-search.spec.ts`, `tests/e2e/mail-search.spec.ts`
- Rename: `src/features/mail/search-policy.ts` → `company-rules.ts`, and `search-policy.test.ts` → `company-rules.test.ts`. Update imports in `matching.ts`, `context.ts`, `company-rule-editor.tsx`, `workspace-data.ts`, `gallery/data.ts` and `gallery/workspace.tsx`.
- Modify:
  - `src/features/mail/workspace.tsx`: remove `HistorySearchPanel` and the "Find older mail" button (`runCheck("history")`).
  - `src/features/mail/workspace-actions.ts`: remove the `companyMailMatches` writes and the `companyRevision` import from `saveWorkspaceRule`.
  - `tests/mail-workspace.integration.test.ts`: remove the cases that use `readCompanyMail` and `companyRevision`.
  - `src/features/mail/triage-actions.ts`: remove `undoDismiss`; its only caller was `mail-sections.tsx`.

**Interfaces:**

- Produces: `src/features/mail/company-rules.ts` exports `CompanyMailRule`, `MailEvidence`, `SearchDecision` and `evaluateCompanyMail`, unchanged.

- [ ] **Step 1:** `git switch -c shared-mail-foundation`
- [ ] **Step 2:** Make the deletions, the rename and the modifications listed above.
- [ ] **Step 3:** Prove no reference is left.
      Run: `grep -rnE "search-service|search-contract|search-state|search-http|search-preview|search-workspace|company-search|history-search-panel|search-policy|mail-sections|/mail/search|api/v1/mail/(company/)?search|undoDismiss" src tests scripts`
      Expected: no output.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npx vitest run`
      Expected: all pass. The two integration files skip without `MAIL_DB_TEST`.
- [ ] **Step 5:** Commit as `JOB_FINDER-9999: Retire provider and company mail search`.

---

### Task 2: Cut over to one email record and one attention flag

**Files:**

- Modify `src/db/schema.ts`:
  - `mailMessages`:
    - add `companyKey: text("company_key")` and `folders: strings("folders")`
    - add index `mail_messages_attention_idx` on `(attentionState, receivedAt)` and index `mail_messages_company_idx` on `companyKey`
  - `mailTracking`: `disposition` defaults to `"kept"`. The check `mail_tracking_disposition_check` becomes `IN ('kept','excluded')`.
  - Delete `companyMailMatches`.
  - `jobs`:
    - add `postedAtKind: text("posted_at_kind")` and `postedAtSourceUrl: text("posted_at_source_url")`
    - add check `jobs_posted_at_kind_check`: `posted_at_kind IS NULL OR posted_at_kind IN ('ORIGINAL','LATEST_PUBLICATION')`
- Create `drizzle/0012_shared_mail_foundation.sql` with its snapshot and journal entry.
- Create:
  - `scripts/test-db.mjs`, and add `"test:db": "node scripts/test-db.mjs"` to `package.json`
  - `tests/helpers/e2e-db.ts`
  - `tests/mail-cutover.integration.test.ts`
- Modify:
  - `src/features/mail/state.ts`, `handling-service.ts`, `handled.ts`, `read.ts`
  - `src/app/mail/[id]/page.tsx`
  - `src/features/mail/scan-service.ts`, `workspace-read.ts`, `workspace-actions.ts`
  - `scripts/seed-test.ts`
  - `tests/mail-state.test.ts`, `tests/mail-workspace.integration.test.ts`

**Interfaces:**

- Produces:
  - `mailIsOpen(message: { attentionState: string }): boolean`, which returns `attentionState !== "DONE"`. Events no longer matter. `mailCanUndoDismiss` is deleted.
  - Schema fields `mailMessages.companyKey: string | null`, `mailMessages.folders: string[]`, `jobs.postedAtKind: string | null` and `jobs.postedAtSourceUrl: string | null`.
  - `tests/helpers/e2e-db.ts`: `export const dbTests = process.env.MAIL_DB_TEST === "1"` and `export async function assertE2eDatabase(): Promise<void>`. The function throws unless the `DATABASE_URL` path is `/jobops_e2e` and the `__jobops_e2e` settings marker has `ownedBy === "jobops-browser-tests"`.
  - The setting `mailCheckReleasedAt` with value `{ at: <ISO timestamp> }`.

- [ ] **Step 1: Add `scripts/test-db.mjs`.**
  - It loads `.env` with `dotenv/config` and derives the same URL with its path set to `/jobops_e2e`. It refuses any other path.
  - It runs `npx drizzle-kit migrate` with that `DATABASE_URL`.
  - It then runs `npx vitest run --no-file-parallelism <args or tests/*.integration.test.ts>` with `DATABASE_URL` set to the e2e URL and `MAIL_DB_TEST=1`.
  - It exits with vitest's exit code.

  Then switch the existing integration file to `dbTests` and `assertE2eDatabase()` from the helper.

- [ ] **Step 2: Write the failing cutover test** `tests/mail-cutover.integration.test.ts`. It reads `drizzle/0012_shared_mail_foundation.sql` and keeps the text between `-- cutover:start` and `-- cutover:end`. It splits that on `--> statement-breakpoint` and runs each non-empty chunk with `db.execute(sql.raw(chunk))`. Fixtures use a unique prefix. Cases:
  - `backfills folders and a single company onto kept mail`:
    - Seed a message (`OPEN`, `company_key` null, `folders` `[]`) whose ledger row is `kept`, with `companyKeys: ["fixture co"]` and `folders: ["Junk"]`.
    - After the cutover, the message has `companyKey === "fixture co"`, `folders` equal to `["Junk"]`, `attentionState === "DONE"` and a non-null `processedAt`.
  - `leaves company empty when the ledger matched several companies`: the ledger has `companyKeys: ["a","b"]`, so `companyKey` stays null.
  - `keeps the global latest checkpoint as last fetch and drops the rest`:
    - Seed a connection and these settings: `mailScan:v2:<id>:latest:d82b2b55630461181d24bf437edb43ac844dc4ae880a661a2e74a8a1d7564312` with `{ complete: true, until: "2026-10-29T10:00:00.000Z" }`, plus `mailScan:v2:<id>:history:x`, `mailScan:v2:<id>:latest:other`, `companyMailScan:v1:x:y:latest`, `mailCursor:<id>` and `mailPolicy:2026-10-30.4`.
    - After the cutover, `lastSyncedAt` equals `2026-10-29T10:00:00Z`. The global key remains; the other five are gone. `mailCheckReleasedAt` exists.
  - `is idempotent`: running the block a second time changes no fixture row (compare `processedAt` and `lastSyncedAt`).
- [ ] **Step 3: Make the schema edits.** Run `npx drizzle-kit generate --name shared_mail_foundation`, then reorder the generated SQL to exactly this, keeping the generated snapshot:

  ```sql
  ALTER TABLE "mail_tracking" DROP CONSTRAINT "mail_tracking_disposition_check";--> statement-breakpoint
  ALTER TABLE "mail_tracking" ALTER COLUMN "disposition" SET DEFAULT 'kept';--> statement-breakpoint
  ALTER TABLE "mail_messages" ADD COLUMN "company_key" text;--> statement-breakpoint
  ALTER TABLE "mail_messages" ADD COLUMN "folders" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
  ALTER TABLE "jobs" ADD COLUMN "posted_at_kind" text;--> statement-breakpoint
  ALTER TABLE "jobs" ADD COLUMN "posted_at_source_url" text;--> statement-breakpoint
  ALTER TABLE "jobs" ADD CONSTRAINT "jobs_posted_at_kind_check" CHECK ("jobs"."posted_at_kind" IS NULL OR "jobs"."posted_at_kind" IN ('ORIGINAL','LATEST_PUBLICATION'));--> statement-breakpoint
  CREATE INDEX "mail_messages_attention_idx" ON "mail_messages" USING btree ("attention_state","received_at");--> statement-breakpoint
  CREATE INDEX "mail_messages_company_idx" ON "mail_messages" USING btree ("company_key");--> statement-breakpoint
  -- cutover:start
  UPDATE "mail_messages" m SET "folders" = t."folders" FROM "mail_tracking" t WHERE t."message_id" = m."id" AND m."folders" = '[]'::jsonb AND t."folders" <> '[]'::jsonb;--> statement-breakpoint
  UPDATE "mail_messages" m SET "company_key" = t."company_keys"->>0 FROM "mail_tracking" t WHERE t."message_id" = m."id" AND m."company_key" IS NULL AND jsonb_array_length(t."company_keys") = 1;--> statement-breakpoint
  UPDATE "mail_tracking" SET "disposition" = 'kept' WHERE "disposition" IN ('latest','history');--> statement-breakpoint
  UPDATE "mail_messages" SET "attention_state" = 'DONE', "processed_at" = coalesce("processed_at", now()) WHERE "attention_state" <> 'DONE';--> statement-breakpoint
  UPDATE "mail_connections" c SET "last_synced_at" = (s."value"->>'until')::timestamptz FROM "settings" s WHERE s."key" = 'mailScan:v2:' || c."id" || ':latest:d82b2b55630461181d24bf437edb43ac844dc4ae880a661a2e74a8a1d7564312' AND s."value"->>'complete' = 'true';--> statement-breakpoint
  DELETE FROM "settings" WHERE ("key" LIKE 'mailScan:v2:%' AND "key" NOT LIKE 'mailScan:v2:%:latest:d82b2b55630461181d24bf437edb43ac844dc4ae880a661a2e74a8a1d7564312') OR "key" LIKE 'companyMailScan:%' OR "key" LIKE 'mailCursor:%' OR "key" LIKE 'mailPolicy:%';--> statement-breakpoint
  INSERT INTO "settings" ("key", "value") VALUES ('mailCheckReleasedAt', jsonb_build_object('at', now())) ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
  -- cutover:end
  ALTER TABLE "mail_tracking" ADD CONSTRAINT "mail_tracking_disposition_check" CHECK ("mail_tracking"."disposition" IN ('kept','excluded'));--> statement-breakpoint
  DROP TABLE "company_mail_matches" CASCADE;
  ```

  The hash `d82b…4312` is `sha256(JSON.stringify({company:"",application:""}))`, which is the existing unscoped latest-scan key.

- [ ] **Step 4: Move the code to the new model.**
  - `state.ts`: `mailIsOpen` becomes attention-only. Delete `mailCanUndoDismiss`. Update callers: `requireOpenMail`, `readOpeningMail`, `readOpenMail` and `/mail/[id]`.
  - `read.ts`:
    - In `readMailTriage`, a message is open when `attentionState === "OPEN"` and no ledger row for it is `excluded`.
    - Remove `lastDismissedId` and `lastDismissalToken` from `TriageData`, and remove `restoreDismissal` from `handling-service.ts`.
    - `handled` counts `DONE` messages.
  - `scan-service.ts`:
    - Disposition is `previous?.disposition ?? (decision.disposition === "excluded" ? "excluded" : "kept")`. Delete `retainDisposition` and the DONE/linked override.
    - A new kept import sets `companyKey` when `decision.companyKeys.length === 1`, and sets `folders: raw.folders`.
    - A seen kept message gets `mailMessages.folders = raw.folders`.
  - `workspace-read.ts`: delete `reconcileLegacyMail`. The interim view expression becomes: `excluded` when the ledger is `excluded`, else `latest` when attention is `OPEN`, else `history`. Task 7 replaces it.
  - `workspace-actions.ts`: drop every `disposition` write and the `reconcileLegacyMail` calls.
  - `seed-test.ts`: any `latest` or `history` disposition becomes `kept`.
  - Update `tests/mail-state.test.ts` for the new `mailIsOpen`, and the ledger expectations in `tests/mail-workspace.integration.test.ts` (`"latest"`/`"history"` become `"kept"`).
- [ ] **Step 5:** `npm run test:db -- tests/mail-cutover.integration.test.ts tests/mail-workspace.integration.test.ts`
      Expected: every case passes, and `jobops_e2e` reports migration 0012 applied.
- [ ] **Step 6:** `npm run typecheck && npm run lint && npx vitest run`
      Expected: pass.
- [ ] **Step 7:** Commit as `JOB_FINDER-9999: Cut mail over to one record and one attention flag`.

---

### Task 3: Tags, the shared `MailItem` and the mail list API

**Files:**

- Create:
  - `src/features/mail/tags.ts` and `tags.test.ts`
  - `src/features/mail/mail-item.ts` and `tests/mail-item.test.ts`
  - `src/features/mail/mail-list.ts` and `tests/mail-list.integration.test.ts`
  - `src/features/agent-api/http.ts`
  - `src/app/api/v1/mail/route.ts` and `tests/mail-api.test.ts`
- Modify: `src/proxy.ts`, `tests/security.test.ts`, and `src/features/mail/workspace-read.ts` (import `kindLabel` from `tags.ts` and delete the local `kindLabels`).

**Interfaces:**

- Consumes: `mailMessages.companyKey` and `folders` (Task 2), and `MailContext` from `context.ts`.
- Produces:
  - **`tags.ts`:**
    - `mailTags = ["opportunity","process","offer","rejected","other"] as const` and `type MailTag`
    - `tagOf(c: MailClassification): MailTag`
    - `classificationsFor(tag: MailTag): MailClassification[]`
    - `classificationForTag(tag: MailTag, current: MailClassification): MailClassification`. For `process` it keeps `current` when `current` is already a process classification, otherwise it returns `FOLLOW_UP`. For the other tags it returns the table's single classification.
    - `tagLabel: Record<MailTag, string>`, using the labels in Global Constraints
    - `kindLabel: Record<MailClassification, string>`, moved from `workspace-read.ts`
  - **`mail-item.ts`:**
    - `type MailItem = { id; account; provider; folders: string[]; receivedAt: string; sender; senderName; subject; text; company: { key: string; name: string } | null; application: { id: string; role: string } | null; tag: MailTag; kind: string; attention: "open" | "handled"; handledAt: string | null; outcome: OutcomeId | null }`
    - `type MailLookup = { companies: Map<string, string>; applications: Map<string, { company: string; role: string }> }`
    - `mailLookup(context: MailContext): MailLookup`
    - `toMailItem(row: typeof mailMessages.$inferSelect & { outcome: string | null }, lookup: MailLookup): MailItem`
    - Field rules:
      - `company` comes from the linked application's company when linked, else from `companyKey`, with `name` from `lookup.companies` falling back to the key.
      - `text` is `bodyText || snippet`.
      - `account` is `accountEmail ?? ""`.
      - `outcome` is set only when the value is in `outcomeIds`.
  - **`mail-list.ts`:**
    - `mailListSchema`, a zod object:
      - `attention`: `"open" | "all"`, default `"all"`
      - `tag`: one of `mailTags`, optional
      - `company`: string of at most 300 characters, optional
      - `application`: uuid, optional
      - `q`: string of at most 200 characters, optional
      - `cursor`: `^<ISO>\|<uuid>$`, optional
    - `listMail(filters: z.input<typeof mailListSchema>): Promise<{ items: MailItem[]; nextCursor: string | null; openCount: number }>`
    - Query rules:
      - Order by `receivedAt DESC, id DESC` and fetch 51 rows to detect a next page.
      - The company filter matches `companyKey = company`, or `linkedApplicationId` in that company's applications from the context.
      - `q` runs `ILIKE` with escaped `%`, `_` and `\` across subject, sender, sender name, body text and snippet.
      - Every query, including `openCount`, adds `NOT EXISTS (ledger row for this message with disposition 'excluded')`.
      - `outcome` is the latest `application_events.payload->>'outcome'` where `payload->>'mailMessageId' = id::text`.
  - **`agent-api/http.ts`:**
    - `class ApiError extends Error { status: number; details?: Record<string, unknown> }`
    - `apiResponse(body: unknown, status = 200): Response`, with headers `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`
    - `readJson(request: Request): Promise<unknown>`: 415 for a non-JSON content type, 413 above 64 KiB, `SyntaxError` for malformed JSON, and 403 when a `next-action` header is present
    - `apiError(error: unknown): Response`:
      - `ZodError` → 400 `{ error: "Invalid request.", issues: [{ path, message }] }`
      - `SyntaxError` → 400 "Malformed JSON."
      - `ApiError` → its status, merged with its details
      - anything else → 500 "JobOps could not complete this request. Check the local database and retry." (never the raw message)
  - **`proxy.ts`:** replace `companyApi` with `agentApi = /^\/api\/v1\/(?:companies(?:\/[^/]+)?|mail(?:\/check|\/[0-9a-f-]{36}(?:\/handle)?)?|applications|resumes)\/?$/`, keeping the current `companyApi` behaviour for all of them.

- [ ] **Step 1: Write the failing tests.**
  - `tags.test.ts`: `maps every classification to its tag` covers all 8 classifications against the Global Constraints table. `retagging to process keeps an existing process kind`: `classificationForTag("process","INTERVIEW") === "INTERVIEW"` and `classificationForTag("process","OFFER") === "FOLLOW_UP"`.
  - `tests/mail-item.test.ts`:
    - `prefers the linked application's company`
    - `falls back to the placed company key`
    - `serializes DONE as handled and OPEN as open`
    - `uses the snippet when the body is empty`
    - `drops an unknown outcome id`
  - `tests/mail-list.integration.test.ts` (seeds its own messages and ledger rows):
    - `filters by attention, tag, company, application and q`
    - `pages with a cursor 50 at a time`: 55 messages give 50 items and then 5, with no overlap.
    - `hides messages whose ledger row is excluded`: the message is absent from `items` and from `openCount`.
    - `returns the outcome recorded from the email`
  - `tests/mail-api.test.ts`: mock `listMail`. `GET passes parsed filters and no-store headers`; `rejects an invalid filter with 400 and issues`; `hides internal errors`.
  - `tests/security.test.ts`, `agent API paths keep the LAN trust rules`. For `/api/v1/mail/check`, `/api/v1/mail/<uuid>/handle`, `/api/v1/applications` and `/api/v1/resumes` on the trusted LAN host:
    - POST without an origin → 200
    - a `next-action` header → 403
    - a foreign origin → 403
- [ ] **Step 2:** `npx vitest run src/features/mail/tags.test.ts tests/mail-item.test.ts tests/mail-api.test.ts tests/security.test.ts`
      Expected: FAIL, because the modules don't exist yet.
- [ ] **Step 3: Implement** `tags.ts`, `mail-item.ts`, `mail-list.ts`, `agent-api/http.ts`, `GET /api/v1/mail` (`listMail(mailListSchema.parse(searchParams))`, with `runtime = "nodejs"` and `dynamic = "force-dynamic"`) and the proxy change.
- [ ] **Step 4:** Run the unit command from Step 2, then `npm run test:db -- tests/mail-list.integration.test.ts`.
      Expected: PASS.
- [ ] **Step 5:** `npm run typecheck && npm run lint`, then commit as `JOB_FINDER-9999: Add mail tags, shared mail items and the mail list API`.

---

### Task 4: One on-demand Check mail

**Files:**

- Create `src/features/mail/check-service.ts` and `check-service.test.ts`, and `src/app/api/v1/mail/check/route.ts`.
- Delete:
  - `src/features/mail/scan-service.ts`, `refresh-service.ts`, `refresh-summary.ts`
  - `tests/mail-refresh.test.ts`
  - `listRecruitingMail` from `src/services/mail/providers/types.ts`, `gmail.ts` and `outlook.ts`, plus its cases in `gmail.test.ts` and `outlook.test.ts`
- Replace `tests/mail-workspace.integration.test.ts` with `tests/mail-check.integration.test.ts`.
- Modify:
  - `src/features/mail/workspace-actions.ts`: replace `checkWorkspaceMail` with `checkMail`.
  - `src/features/mail/actions.ts`: `refreshAllInboxes` calls `checkMailStep` up to 4 times while `more`.
  - `src/features/mail/workspace.tsx`: the Check mail button calls `checkMail`.
  - `tests/mail-refresh-actions.test.ts`
  - `tests/e2e/mail-refresh-service.spec.ts`, `tests/e2e/outlook-provider.spec.ts` and `tests/e2e/provider-recipient-data.spec.ts`: call `checkConnection` and mock `scanMail` in place of `refreshConnection` and `listRecruitingMail`. Keep the lock-serialisation, disconnect-during-check, token-rotation and recipient-data cases. Delete cases that only assert refresh cursors.

**Interfaces:**

- Consumes: `matchMail`, `importMailRecords`, `withConnectionLock`, `providerFor`, `loadMailContext` and the `mailCheckReleasedAt` setting.
- Produces:
  - `checkKey(connectionId: string): string`, which returns `mailScan:v2:${connectionId}:latest:d82b2b55630461181d24bf437edb43ac844dc4ae880a661a2e74a8a1d7564312`.
  - `type CheckProgress = { since: string; until: string; next?: string; complete: boolean; scanned: number; folders: MailFolder[]; checkedAt: string }`
  - `checkWindow(stored: CheckProgress | undefined, releasedAt: string, now: Date): CheckProgress`:
    - an incomplete stored window → that window unchanged (resume)
    - a complete stored window → `since = until − 1 hour` and `until = now`
    - no stored window → `since = releasedAt` and `until = now`
    - `until` stays fixed until `complete`
  - `type AccountCheck = { account: string; provider: string; status: "done" | "more" | "failed"; error: string | null; lastFetchedAt: string | null }`
  - `type CheckResult = { more: boolean; newAttention: number; accounts: AccountCheck[] }`
  - `checkConnection(connection: MailConnection, context: MailContext): Promise<AccountCheck & { newAttention: number }>`. It checks one provider page and never throws for provider or token errors.
  - `checkMailStep(): Promise<CheckResult>`:
    - It throws `ApiError("Connect an inbox before checking mail.", 409)` when there are no connections.
    - If any account has an incomplete window, it steps only those accounts; otherwise it steps all of them.
    - It uses `Promise.allSettled` per account.
  - `checkMail(): Promise<ActionState & { mailCheck?: CheckResult }>`, a server action that revalidates `/mail`, `/applications`, `/companies` and `/`.
- Behaviour of `checkConnection`:
  - Context-only (sent or draft) messages are skipped.
  - An unseen excluded message gets a ledger row with `excluded` and no message.
  - An unseen kept message is imported with `attentionState` `OPEN`, `companyKey` (when exactly one company matches) and `folders`, and gets a `kept` ledger row. Keep the contact-reply `FOLLOW_UP` adjustment and `suggestedApplicationId` on events.
  - A seen identity, matched by provider id or legacy id as today, only updates the ledger `folders` (and the message's `folders` when kept). It is never re-imported or reopened, even if its ledger row was excluded.
  - Each page commits the checkpoint, `lastRefreshedAt` and `lastError: null` in the same transaction as its rows.
  - `lastSyncedAt` is set to `until` only on the page that completes the window.
  - On error, it stores the sanitised message (same rule as today's `ScanFailure`) in `lastError` and returns `status: "failed"`.

- [ ] **Step 1: Write the failing unit tests** `check-service.test.ts` for `checkWindow`:
  - `resumes an incomplete window unchanged`
  - `overlaps a complete window by exactly one hour`: a stored `until` of `2026-10-30T10:00:00Z` gives `since === "2026-10-30T09:00:00.000Z"`.
  - `starts a never-fetched account at release`
  - `fixes until at the first step`
- [ ] **Step 2: Write the failing integration tests** `tests/mail-check.integration.test.ts`, using `vi.spyOn(outlook, "folders" | "scanMail")` as the current file does:
  - `imports Junk and Deleted Items mail as open records`: the two messages are `OPEN`, with folders `["Junk"]` and `["Deleted Items"]`.
  - `keeps one identity across a rescan and folder move`: one ledger row and one message, and the message's folders become `["Inbox"]`.
  - `counts a repeated identity once within a page`
  - `does not collapse one Internet Message-ID across two accounts`: two ledger rows.
  - `never imports excluded or context-only mail, even after a rule change`: a LinkedIn digest gets an excluded ledger row and no message. The same identity is still not imported after the company rule changes.
  - `isolates a failing account`: account A's `scanMail` rejects with `token expired` while B completes. A has `status "failed"`, `lastError` set and `lastSyncedAt` unchanged; B is `done`.
  - `advances last fetch only when the window completes`:
    - page 1 returns `next` → `status "more"` and `lastSyncedAt` unchanged
    - step 2 → `done` and `lastSyncedAt` equals the window's `until`
  - `resumes an incomplete check after a rule edit`: after page 1, save a new rule, then step again. The provider receives the same `since`/`until` and `next`, and no message is imported twice.
- [ ] **Step 3:** `npx vitest run src/features/mail/check-service.test.ts`
      Expected: FAIL (the module is missing).
- [ ] **Step 4: Implement** `check-service.ts`, porting the page loop from `scan-service.ts` without scope or mode. Then add the route `POST /api/v1/mail/check`: `readJson` is not required; an empty body is accepted. It returns `apiResponse(await checkMailStep())` and maps errors through `apiError`. Make the deletions and caller updates listed above.
- [ ] **Step 5:** Run `npx vitest run src/features/mail/check-service.test.ts tests/mail-refresh-actions.test.ts src/services/mail/providers`, then `npm run test:db -- tests/mail-check.integration.test.ts`.
      Expected: PASS.
- [ ] **Step 6:** `grep -rnE "scanConnection|scan-service|refreshConnection|refresh-service|listRecruitingMail|\"history\" ?\| ?\"latest\"" src tests` is empty, then `npm run typecheck && npm run lint`.
- [ ] **Step 7:** Commit as `JOB_FINDER-9999: Replace mail scans with an on-demand check`.

---

### Task 5: Handle, retag and place mail

**Files:**

- Create:
  - `src/features/mail/handle-service.ts` and `tests/mail-handle.test.ts`
  - `tests/mail-handle.integration.test.ts`
  - `src/app/api/v1/mail/[id]/handle/route.ts` and `src/app/api/v1/mail/[id]/route.ts`
  - `tests/mail-handle-api.test.ts`
- Modify:
  - `src/features/mail/source-policy.ts`
  - `src/features/mail/context.ts` (add `companyKeyFor`)
  - `tests/application-outcome-actions.test.ts` and any test asserting the old bucket errors

**Interfaces:**

- Consumes:
  - `applyOutcome(tx, { applicationId, outcome, detail, mailMessageId }, now)` from `outcome-service.ts`
  - `lockMail` from `handling-service.ts`
  - `toMailItem` and `mailLookup` (Task 3); `classificationForTag` (Task 3)
  - `ApiError` (Task 3)
- Produces:
  - `companyKeyFor(companyName: string, companies: { name: string; aliases: string[] }[]): string`, which is `normalizeCompany(companyResolver(companies)(companyName))`.
  - `handleSchema`, a strict zod union of two forms:
    - `{ justInfo: true }`
    - `{ outcome: z.enum(outcomeIds), applicationId?: uuid, details?: { note?: ≤2000, name?: ≤200, kind?: roundKinds, at?: ISO datetime, happenedAt?: ISO datetime } }`
  - `updateSchema`, strict with at least one key: `{ tag?: MailTag, company?: string ≤300 | null, application?: uuid | null }`
  - `handleMail(mailId: string, input: unknown, now?: Date): Promise<MailItem>`
  - `updateMail(mailId: string, input: unknown, now?: Date): Promise<MailItem>`
- Rules:
  - **`justInfo`:**
    - On an already handled email, return the current item without writing (idempotent).
    - Otherwise, in one transaction, set `DONE` and `processedAt = now`, set event status to `REVIEWED` with `details.justInfo = true`, and write activity `MAIL_JUST_INFO`.
  - **`outcome`:** resolve the application in this order:
    1. An explicit `applicationId`. A 404 `ApiError` if missing.
    2. The message's `linkedApplicationId`.
    3. The single open application whose company key equals `companyKey`.

    Resolution errors:
    - No company and no application → 409 "Place this email at a company or pass applicationId."
    - Zero open applications → 409 "No open application at this company. Record the application first or pass applicationId."
    - More than one → 409 "This company has more than one open application. Pass applicationId." with `details.candidates: [{ id, role }]`
    - The email's company differs from the application's company key → 409 "This email is placed at <company>. Move it before recording this outcome."

    Then call `applyOutcome` with `detail = { kind, at, name: name ?? "", note: note ?? "", happenedAt: happenedAt ?? min(message.receivedAt, now) }`. A null `companyKey` is set to the application's company key.

  - **`updateMail`** never changes attention:
    - `tag` writes `classification` and every event `type`, and logs `MAIL_RETAGGED` with `{ from, to }`.
    - `company` must be a context company key, or null. It is refused (409) while the email is linked to an application at another company.
    - `application` sets `linkedApplicationId` and `companyKey`; null clears `linkedApplicationId` only.
    - `company` and `application` changes log `MAIL_PLACED`.
  - **`source-policy.requireRecordMail`** drops the bucket gate. It keeps two refusals: an acknowledgement in `"outcome"` mode ("Link this acknowledgement without recording an outcome."), and an email placed at a different company than the record (the 409 message above).
  - **Routes:**
    - `POST /api/v1/mail/{id}/handle` → `apiResponse({ item })`
    - `PATCH /api/v1/mail/{id}` → `apiResponse({ item })`
    - Both use `readJson`, and return 404 for a non-uuid or missing id.

- [ ] **Step 1: Write the failing tests.**
  - `tests/mail-handle.test.ts` (schema):
    - `accepts justInfo and outcome forms`
    - `rejects both forms together and unknown keys`
    - `rejects a future happenedAt`
    - `update requires at least one field`
  - `tests/mail-handle.integration.test.ts`:
    - `just info clears attention and is idempotent`
    - `records an outcome on the company's single open application with the email as source`: an `application_events` row whose payload has `mailMessageId` equal to the email id and `outcome "oa"`; the email is `DONE` and linked.
    - `asks for applicationId when two applications are open`: 409 with two candidates.
    - `refuses an application at another company`: 409.
    - `a second outcome on a handled email is refused`: 409, and still one outcome event.
    - `retag writes classification, event type and an activity log`
    - `placing an email does not change attention`
    - `lane dismissal and API just info write the same flag`: `dismissMessages` on one email and `handleMail({ justInfo: true })` on another both show as `attention: "handled"` in `listMail`.
  - `tests/mail-handle-api.test.ts` (mocks the service): `handle returns 200 with item`; `maps ApiError status and candidates`; `PATCH returns 400 issues for an empty body`; `404 for a non-uuid id`.
- [ ] **Step 2:** `npx vitest run tests/mail-handle.test.ts tests/mail-handle-api.test.ts`
      Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the service, the `companyKeyFor` helper, the `source-policy` change and both routes. Update the existing tests that asserted the removed bucket errors.
- [ ] **Step 4:** Run `npx vitest run tests/mail-handle.test.ts tests/mail-handle-api.test.ts tests/application-outcome-actions.test.ts`, then `npm run test:db -- tests/mail-handle.integration.test.ts`.
      Expected: PASS.
- [ ] **Step 5:** `npm run typecheck && npm run lint`, then commit as `JOB_FINDER-9999: Handle, retag and place mail from one service`.

---

### Task 6: Record-only application APIs

**Files:**

- Create:
  - `src/features/applications/record-service.ts`
  - `src/features/applications/agent-record.ts` and `tests/agent-record.test.ts`
  - `tests/agent-record.integration.test.ts`
  - `src/app/api/v1/applications/route.ts` and `src/app/api/v1/resumes/route.ts`
  - `tests/applications-api.test.ts`
- Modify: `src/features/applications/tracking-actions.ts`, where `recordAction` calls `recordApplication` and behaves the same.

**Interfaces:**

- Consumes:
  - `importJobRows`, `normalizeJobUrl`, `jobDedupeKey` and `resolveDuplicateId` (as `saveMailOpening` uses them)
  - `recordIntent`, `recordSentAt` and `recordMethods`; `indiaDate` from `attention.ts`
  - `companyResolver`; `ApiError`, `readJson`, `apiResponse` and `apiError` (Task 3)
  - `companyKeyFor` (Task 5)
- Produces:
  - `recordApplication(tx: Tx, input: { recordId: string | null; jobId: string; versionId: string | null; method: (typeof recordMethods)[number]; state: "planned" | "sent"; notes: string; recipient: string; url: string; sentAt: Date | null }): Promise<string>`. This is the transaction body moved out of `recordAction` unchanged; it returns the record id.
  - `agentRecordSchema`, strict:
    - `opening`: `{ url, company (1–200), title (1–300), location? (≤300), description? (≤100000), postedAt?: YYYY-MM-DD, postedAtKind?: "original" | "latest_publication", postedAtSourceUrl?: http(s) URL }`. `postedAtKind` and `postedAtSourceUrl` require `postedAt`.
    - `application`: `{ method: recordMethods, submittedAt?: YYYY-MM-DD, resumeVersionId?: uuid, confirmationUrl?: http(s) URL, notes? (≤20000), recipient? (≤1000) }`
    - `humanConfirmed: z.literal(true)`
  - `recordWarnings(input: { postedAt?: string; resumeVersionId?: string }, now: Date): string[]`. In this order:
    - "Posting date unknown. Verify it before applying to similar openings."
    - "Posted <n> days ago, more than 14 calendar days (Asia/Kolkata).", where n is the difference between `indiaDate(now)` and `postedAt`, shown only when n > 14
    - "No resume file recorded for this application."
  - `recordAgentApplication(input: unknown, now?: Date): Promise<{ id: string; duplicate: boolean; links: { application: string; company: string | null }; warnings: string[] }>`
  - `findApplications(query: { url?: string; company?: string }): Promise<{ id; company; title; method; status; appliedAt: string | null; url: string }[]>`. Exactly one of `url` and `company` is required, otherwise a 400 `ApiError`. Matching is by canonical URL, or by `companyKeyFor`.
  - `listResumeFiles(): Promise<{ id: string; family: string; label: string; isCurrent: boolean }[]>`. These are versions of active resumes, current first.
- Rules for `recordAgentApplication`. It runs in one transaction:
  1. Take `pg_advisory_xact_lock(8093210)` first. This is the lock `importJobRows` uses, and it is re-entrant within one transaction, so concurrent posts serialise before the duplicate check. Then find the job by canonical URL. If an application exists for that job with `source === method`, return `duplicate: true` with no writes.
  2. Otherwise create or match the job through `importJobRows([{ …opening, source: "AGENT_RECORD" }], "skip", tx)`.
  3. Write posting-date provenance (`postedAt`, `postedAtKind` uppercased, `postedAtSourceUrl`) only when the job has no `postedAt`, or the input kind is `original` and the stored kind is not `ORIGINAL`.
  4. Call `recordApplication` with `state: "sent"`, `url: confirmationUrl ?? ""` and `sentAt: submittedAt ? recordSentAt(submittedAt, now) : now`.

  The company link is `/companies/<slug>` when the company resolves to a company record, else null. The route revalidates `/` with `"layout"`.

- Routes:
  - `GET /api/v1/applications?url=|company=` → `{ applications }`
  - `POST /api/v1/applications` → 201 for a new record, 200 for a duplicate
  - `GET /api/v1/resumes` → `{ resumes }`

- [ ] **Step 1: Write the failing tests.**
  - `tests/agent-record.test.ts`:
    - `requires humanConfirmed true`
    - `rejects postedAtKind without postedAt`
    - `freshness uses Asia/Kolkata calendar days`: with `now = 2026-10-30T20:00:00Z` (31 Oct in India), `postedAt 2026-10-17` gives no warning and `2026-10-16` gives "Posted 15 days ago…".
    - `warns on unknown date and missing resume`
  - `tests/agent-record.integration.test.ts`:
    - `records a confirmed direct application`: the status is `APPLIED`; an `APPLICATION_SUBMITTED` event has `payload.humanConfirmed === true`; the job status is `APPLIED`.
    - `repeat post returns duplicate`: one application.
    - `concurrent duplicate posts create one record`: `Promise.all` of two posts gives exactly one `duplicate: true` and one application.
    - `stores posting provenance and backfills an undated opening`
    - `does not replace an original date with a repost date`
    - `finds the record by url and by company`
  - `tests/applications-api.test.ts` (mocks the service): `POST returns 201 then 200 for duplicate`; `400 with issues when humanConfirmed is false`; `415 for non-JSON`; `GET requires url or company`.
- [ ] **Step 2:** `npx vitest run tests/agent-record.test.ts tests/applications-api.test.ts`
      Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the extraction (`recordAction` keeps its redirect and revalidation), the agent module and both routes.
- [ ] **Step 4:** Run `npx vitest run tests/agent-record.test.ts tests/applications-api.test.ts tests/simple-records.test.ts tests/applications.test.ts`, then `npm run test:db -- tests/agent-record.integration.test.ts`.
      Expected: PASS.
- [ ] **Step 5:** `npm run typecheck && npm run lint`, then commit as `JOB_FINDER-9999: Add record-only application APIs`.

---

### Task 7: Stopgap `/mail`: Needs attention and All mail

**Files:**

- Modify:
  - `src/features/mail/workspace-read.ts` and `workspace-data.ts`
  - `src/features/mail/workspace.tsx` and `workspace-actions.ts`
  - `src/app/mail/page.tsx`
  - `src/app/globals.css`, adding tag tokens
- Create `tests/mail-workspace-read.integration.test.ts` and `tests/e2e/mail-foundation.spec.ts`.
- Update the e2e specs that assert Latest, History, Excluded or Mark reviewed (`mail-reader`, `mail-triage`, `inbox-ui`, `workspace`) to the new labels.

**Interfaces:**

- Consumes: `listMail`, `MailItem` and `tagOf`/`tagLabel` (Task 3); `checkMail` (Task 4); `handleMail` and `updateMail` (Task 5).
- Produces:
  - `WorkspaceQuery = { view?: "open" | "all"; company?; application?; q?; cursor?; selected?; notice? }`
  - `MailWorkspaceData = { companies; applications; items: MailItem[]; openCount: number; nextCursor: string | null; connections: { id; provider; email; lastChecked: string | null; lastError: string | null }[]; configs; coverage }`, where `lastChecked` is `lastSyncedAt`
  - Server actions, using the same `(previous: ActionState, form: FormData)` shape as the current workspace actions:
    - `handleMailAction`, with form fields `id` plus either `justInfo=1`, or `outcome` and an optional `applicationId`
    - `placeMailAction`, with form fields `id` plus `application` or `company` (an empty value clears it)
    - Both call the Task 5 services and replace `reviewWorkspaceMail` and `associateWorkspaceMail`, which are deleted.
  - `saveWorkspaceRule` saves the rule, then re-places mail. It runs `matchMail` on kept, unlinked messages with a null `companyKey`, built from their stored sender, subject and body, and sets `companyKey` when the decision's `companyKeys` is exactly `[ruleCompany]`. Attention and exclusions never change.
  - CSS tokens `--tag-opportunity`, `--tag-process`, `--tag-offer`, `--tag-rejected` and `--tag-other`, each with a `-container` pair, for light and dark. They use the existing primary, review, destructive and muted tokens, and Google green (`#188038` light, `#81c995` dark) for offer.
- UI rules:
  - The two tabs are "Needs attention (<openCount>)" (default) and "All mail".
  - Each row shows a tag chip (dot plus label) from the tokens.
  - The reader footer shows "Just info", the primary action, which is hidden for handled mail, and the existing "Link to application" picker, which now calls `placeMailAction`.
  - "Check mail" loops `checkMail` while `mailCheck.more` (at most 20 calls). It shows "Checking <n> inboxes…" during the loop and "<k> new need attention" or "No new mail" at the end.
  - A failed account shows a "Reconnect" notice linking to `/settings`.
  - The search box (`q`) and the company and application scopes keep working.
  - Remove the Latest/History/Excluded tabs, the counts, the history and exclusion notes and the scan list.

- [ ] **Step 1: Write the failing tests.**
  - `tests/mail-workspace-read.integration.test.ts`:
    - `workspace items equal the API items for the same filters`: `readMailWorkspace({view:"open"}).items` deep-equals `listMail({attention:"open"}).items`.
    - `rule save places unplaced mail without reopening it`
  - `tests/e2e/mail-foundation.spec.ts`:
    - `needs attention, then just info`: seed an `OPEN` `INTERVIEW` email with `seedMail`. On `/mail` the "Needs attention" tab shows its subject and the chip "Application / interview". After "Just info" the subject leaves the tab; under "All mail" it is present.
    - `agent record appears on Applications and the company page`:
      - `POST /api/v1/companies` creates a fixture company.
      - `POST /api/v1/applications` (with `humanConfirmed: true`) returns 201 with links.
      - `/applications` shows the company lane, and `links.company` shows "Applications (1)" with the role title.
    - `captures the mail page for review`: full-page screenshots of `/mail` at 375×812 and 1440×900, in light and dark (`page.emulateMedia({ colorScheme })`), saved to `test-results/mail-foundation/`.
- [ ] **Step 2:** `npm run test:db -- tests/mail-workspace-read.integration.test.ts`
      Expected: FAIL, because the old `MailWorkspaceData` has no `items`.
- [ ] **Step 3: Implement** the read model, the actions, the tokens and the `workspace.tsx` changes. Keep the existing layout, selection, mobile reader and rule editor.
- [ ] **Step 4:** Run `npm run test:db -- tests/mail-workspace-read.integration.test.ts`, then `npm run test:e2e`.
      Expected: all pass, including the updated specs.
- [ ] **Step 5:** Read the four screenshots in `test-results/mail-foundation/` and check: tab and chip contrast in both themes, no horizontal scroll at 375 px, and that Just info is the one primary action. Fix any issue and re-run the spec. No host dev server is started; the live review on port 3210 happens after "go" in Task 8.
- [ ] **Step 6:** `npm run typecheck && npm run lint && npx vitest run`, then commit as `JOB_FINDER-9999: Simplify /mail to Needs attention and All mail`.

---

### Task 8: Release checks and rehearsal (stops before the personal database)

**Files:**

- Modify:
  - the spec's status line, to say it is implemented on branch `shared-mail-foundation`
  - the root `AGENTS.md` product-scope bullet: add the API paths and "attention stored as OPEN/DONE"
- Private and uncommitted: `../backups/2026-10-30-mail-foundation/` (the backup and a counts file).

- [ ] **Step 1: Full verification.**
      Run: `npm run typecheck && npm run lint && npm run format:check && npx vitest run && npm run test:db && npm run test:e2e && docker compose build app`
      Expected: all pass. Report pre-existing prettier warnings in untouched files rather than reformatting them.
- [ ] **Step 2: Back up the personal database (read-only).**
      Run `mkdir -p ../backups/2026-10-30-mail-foundation && docker compose exec -T postgres pg_dump --format=custom --username jobops jobops > ../backups/2026-10-30-mail-foundation/jobops.dump`
      Expected: a non-empty file that `git status` does not show.
- [ ] **Step 3: Rehearse the migration.**
  - Restore the dump into a scratch database: `docker compose exec -T postgres createdb --username jobops jobops_rehearsal`, then `docker compose exec -T postgres pg_restore --username jobops --dbname jobops_rehearsal < ../backups/2026-10-30-mail-foundation/jobops.dump`.
  - Record counts before: messages, ledger rows by disposition, `OPEN` messages, connections with a global latest checkpoint, `company_mail_matches` rows and settings by key prefix.
  - Run `npx drizzle-kit migrate` with `DATABASE_URL` set to `jobops_rehearsal`, and record the counts again.
  - Expected:
    - the message count is unchanged
    - kept + excluded equals the old latest + history + excluded
    - `OPEN` = 0
    - one `last_synced_at` per complete checkpoint
    - `company_mail_matches` is gone
    - only global latest checkpoints remain
  - Save both count sets to the backup folder, then drop `jobops_rehearsal`.
- [ ] **Step 4:** Commit the docs as `JOB_FINDER-9999: Record the shared mail foundation release`.
- [ ] **Step 5: Stop.** Report the rehearsal counts and ask the user for "go" before running `docker compose up -d --build`, which applies migration 0012 to the personal database. No real mail check runs unless the user asks.
- [ ] **Step 6 (after "go"):** Run `docker compose up -d --build`. Then open `http://127.0.0.1:3210/mail` and `/applications` in the browser pane, and confirm all three of these without pressing Check mail:
  - "Needs attention" is empty, because the cutover handled all existing mail.
  - Existing mail shows under "All mail" with tags.
  - The connection rows show "Last checked".
