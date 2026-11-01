# Job Mail Feed and Company Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover and keep the user's job mail visibly: ten job tags, a sorter that stops dropping real job mail, Fetch new mail with a last-N-days window, transparent per-company inbox search with Include this, company status with previous jobs, a newest-first job-mail feed, and Applications lanes per application.

**Architecture:** The per-page ingest inside `check-service.ts` moves into `ingest.ts` so Check mail and the new company search share one path (ledger, re-deciding dropped identities, attention). Providers gain a query search and a single-message fetch. Company search keeps a cursor per company and inbox in `settings`, like Check mail. UI work reuses the timeline module (`/mail`, company page) and the Applications lanes, following the gallery picks recorded in the spec.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle 0.45 on PostgreSQL, zod 4, vitest, Playwright, Tailwind 4 tokens, Gmail API, Microsoft Graph.

**Spec:** `docs/superpowers/specs/2026-10-31-job-mail-feed-and-search-design.md` (picks table at the top; §1–§10).

## Global Constraints

- Normal use is Docker-only (`docker compose up -d --build`). No host dev servers; Playwright's port 3211 server is allowed.
- Database and browser tests use only the marked `jobops_e2e` database (`npm run test:db`, `npm run test:e2e`). Never point them at personal data.
- Mailbox access stays read-only. No LLM calls, no sending, no schedules.
- Excluded mail is never shown in the feed or timelines; it appears only in a dropped list with its reason.
- A `kept` ledger identity is never re-imported or reopened. An `excluded` one is re-decided when seen again.
- Search terms are literal phrases. Reject `"`, `\` and control characters.
- Main fetch Last N days: 1–180. Company search Last N days: 1–3650. A day is 24 elapsed hours, resolved once into explicit bounds.
- Dates group and display in Asia/Kolkata. Email bodies are plain text; HTML is never rendered.
- Colours come from theme tokens only (`--tag-*`, `bg-selected`, `text-link`). The gallery's candidate literals move into `theme.css`/`globals.css`; no palette literals in product components.
- Copy is sentence case, no all-caps labels, plain verbs.
- Before any migration on personal data: a private backup in `backups/` (never committed), and the user's go.
- Commits are `JOB_FINDER-9999: <summary>` ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **Old mail flooding Needs you.** A Last N days fetch or a company search that recovers 200 old emails must not mark them open. Pinned in Task 3 (`recovered mail before the previous last fetch enters handled`).
2. **A rule edit that would claim everyone's mail.** A keyword like "Interview" (any case, padded with spaces) must be refused, not saved. Pinned in Task 2 (`refuses generic job words in any case`).
3. **Include this on a shared sender.** Including a Workday or personal Gmail email must keep the email and leave the company's addresses unchanged. Pinned in Task 6 (`does not add a shared sender`).
4. **An inbox failing mid-search.** One expired Outlook token must not stop Gmail's search, and the run must report that inbox as failed with a reconnect message. Pinned in Task 6 (`one failed inbox does not stop the others`).
5. **Re-running a search over the same window.** A second identical search must report everything as already here and create no new mail or open attention. Pinned in Task 6 (`a repeated search changes nothing`).

---

### Task 1: Ten job tags, new classifications and sorter phrases

**Files:**

- Modify: `src/db/schema.ts` (`mailClassifications`), `src/features/mail/tags.ts`, `src/features/mail/triage.ts` (`suggestedOutcome`), `src/services/mail/classifier.ts`, `src/features/mail/handle-service.ts` (`updateSchema` tag field), `src/features/mail/mail-list.ts` (tag filter), `src/features/timeline/query.ts` (tag param), `src/styles/theme.css`, `src/app/globals.css`, `src/features/timeline/timeline.tsx`, `src/features/timeline/mail-view.tsx`, `src/features/timeline/read.ts`, `src/features/companies/detail.tsx` (tag consumers), `src/features/timeline/gallery/*` (freeze its own five-tag type so the 2026-10-31 gallery keeps compiling)
- Create: `drizzle/0013_job_mail_tags.sql` (via `npm run db:generate`, then hand-check), `src/features/mail/tag-pill.tsx`
- Test: `src/features/mail/tags.test.ts`, `src/services/mail/classifier.test.ts`, `tests/mail-api.test.ts`

**Interfaces:**

- Produces:
  - `mailClassifications` gains `"REFERRAL" | "INTERVIEW_UPDATE" | "BACKGROUND_CHECK" | "ONBOARDING"`.
  - `mailTags = ["application", "referral", "interviewCall", "interviewProcess", "offer", "rejection", "backgroundCheck", "joining", "opportunity", "other"] as const`; `type MailTag`.
  - Classification map: application ← `APPLICATION_ACKNOWLEDGEMENT`, `FOLLOW_UP`; referral ← `REFERRAL`; interviewCall ← `INTERVIEW`, `ASSESSMENT`; interviewProcess ← `INTERVIEW_UPDATE`; offer ← `OFFER`; rejection ← `REJECTION`; backgroundCheck ← `BACKGROUND_CHECK`; joining ← `ONBOARDING`; opportunity ← `RECRUITER_OUTREACH`; other ← `UNKNOWN`.
  - `tagLabel`: "Application", "Referral", "Interview call", "Interview process", "Offer", "Rejection", "Background verification", "Joining", "Opportunity", "Other".
  - `type TagStage = "before" | "applied" | "interviewing" | "offerJoining" | "rejected" | "other"`; `tagStage: Record<MailTag, TagStage>` (before: referral, opportunity; applied: application; interviewing: interviewCall, interviewProcess; offerJoining: offer, backgroundCheck, joining; rejected: rejection; other: other).
  - `legacyTags: Record<"opportunity" | "process" | "offer" | "rejected" | "other", MailTag[]>` with process → `["application", "interviewCall", "interviewProcess"]`, rejected → `["rejection"]`, others to themselves. `parseTagParam(value: string): MailTag[] | null` accepts new and legacy ids (filters); `classificationForTag(tag: MailTag, current)` keeps `current` when it already belongs to the tag, else application → `FOLLOW_UP`, interviewCall → `INTERVIEW`, otherwise the tag's single classification. The PATCH body accepts a legacy id and maps it to its first tag.
  - `kindLabel` additions: REFERRAL "Referral", INTERVIEW_UPDATE "Interview update", BACKGROUND_CHECK "Background verification", ONBOARDING "Joining".
  - `suggestedOutcome` additions: REFERRAL `"referred"`, INTERVIEW_UPDATE `"heard"`, BACKGROUND_CHECK `null`, ONBOARDING `null`.
  - Tokens: `theme.css` adds `--purple`/`--purple-soft` (dark `#d7aefb`/`#3b2b4f`, light `#8430ce`/`#f3e8fd`). `globals.css` defines `--tag-<id>`/`--tag-<id>-container` per stage: before → purple, applied → `--link`/`--primary-container`, interviewing → `--amber`/`--amber-soft`, offerJoining → `--teal`/`--teal-soft`, rejected → `--danger`/`--danger-soft`, other → `--muted-foreground` on transparent with a `--border` ring. Register `--color-tag-*` in `@theme inline`.
  - `TagPill({ tag, short?, className? })`, `tagIcon: Record<MailTag, LucideIcon>` (icons as in `feed-gallery/tags.tsx`) and literal `tagClass` in `src/features/mail/tag-pill.tsx`. Every product tag pill uses it.

- [ ] **Step 1: Write the failing tests.**
  - `tags.test.ts` `maps every classification to its new tag`: each pair from the map above; `tagStage.backgroundCheck === "offerJoining"`; `parseTagParam("process")` equals `["application", "interviewCall", "interviewProcess"]`; `parseTagParam("bogus")` is `null`; `classificationForTag("interviewCall", "ASSESSMENT")` is `"ASSESSMENT"`, `classificationForTag("application", "OFFER")` is `"FOLLOW_UP"`.
  - `classifier.test.ts` cases (subject, body → type), shaped on the real dropped mail:
    - "Thank you for your application to Oracle" → `APPLICATION_ACKNOWLEDGEMENT`
    - "Thank you for your interest in Northstar" + "we will review your profile" → `APPLICATION_ACKNOWLEDGEMENT`
    - "Amazon Interview – CONFIRMATION" → `INTERVIEW`
    - "Feedback - Amazon Onsite Interview" → `INTERVIEW_UPDATE`
    - "Amazon Interview Preparation Call" → `INTERVIEW_UPDATE`
    - "Sathwick, REMINDER to complete your background screen for Amazon" → `BACKGROUND_CHECK`
    - "URGENT Request for Information – Your AMAZON INDIA Background Verification" → `BACKGROUND_CHECK`
    - "Your joining details for Mon 4 April" / "Date of joining and pre-joining formalities" → `ONBOARDING`
    - "I've referred you for Backend Engineer II" / "Referral submitted" → `REFERRAL`
    - existing cases keep passing.
  - `mail-api.test.ts` `accepts new and legacy tag filters`: `GET /api/v1/mail?tag=interviewCall` and `?tag=process` return 200; `?tag=nope` returns 400.
- [ ] **Step 2: Run them.** `npx vitest run src/features/mail/tags.test.ts src/services/mail/classifier.test.ts tests/mail-api.test.ts`. Expected: FAIL on the new tag ids and classifications.
- [ ] **Step 3: Implement.** Add the four classifications and generate `0013_job_mail_tags.sql`; it must contain only four `ALTER TYPE "public"."mail_classification" ADD VALUE '…';` statements. Add classifier rules (REFERRAL, INTERVIEW_UPDATE, BACKGROUND_CHECK, ONBOARDING) and widen ACKNOWLEDGEMENT/INTERVIEW with the phrases in spec §2. Place INTERVIEW_UPDATE and BACKGROUND_CHECK before INTERVIEW in rule order, and treat them as non-conflicting with INTERVIEW (feedback mail often says "interview"). Sender domains `fadv.com`, `hireright.com`, `authbridge.com` alone give `BACKGROUND_CHECK` with confidence 0.9 (pass `sender` into `classifyMail`; make it optional). Then update the tag consumers and tokens.
- [ ] **Step 4: Run the tests, typecheck and lint.** `npx vitest run src/features/mail src/services/mail tests/mail-api.test.ts && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Add ten job tags and recognise background checks, joining and referrals`.

### Task 2: Keywords, generic words, the Other rule and specific drop reasons

**Files:**

- Modify: `src/features/mail/context.ts` (`ruleSchema`, defaults, `blockedDefaults` → `sharedSenderDomains`), `src/features/mail/company-rules.ts`, `src/features/mail/matching.ts`, `src/features/mail/workspace-actions.ts` (`saveWorkspaceRule` field list), `src/features/mail/company-rule-editor.tsx` (labels only; the panel in Task 9 replaces it)
- Test: `src/features/mail/company-rules.test.ts`, `src/features/mail/matching.test.ts`

**Interfaces:**

- Produces:
  - `CompanyMailRule = { company: string; aliases: string[]; domains: string[]; senders: string[]; keywords: string[]; excludedTerms: string[] }`. `subjectTerms` is removed. `ruleSchema` parses a stored legacy `subjectTerms` into `keywords`.
  - `genericJobWords: string[]` (at least: application, applications, interview, interviews, job, jobs, hiring, recruiter, recruiting, recruitment, careers, career, offer, assessment, role, position, opening, talent) and `keywordProblem(value: string): string | null` in `context.ts`. Comparison is trimmed and case-insensitive. The refusal copy: `"<value>" appears in every company's mail, so it can't identify <company>. Try a phrase like "<company> Talent".`
  - `sharedSenderDomains: string[]`: personal mail (gmail.com, googlemail.com, outlook.com, outlook.in, hotmail.com, yahoo.com, icloud.com), ATS (greenhouse.io, lever.co, ashbyhq.com, myworkday.com, workday.com, smartrecruiters.com, icims.com, hackerrank.com, hackerearth.com), portals (naukri.com, instahyre.com, cutshort.io, hirist.tech, linkedin.com) and BGV vendors (fadv.com, hireright.com, authbridge.com). `isSharedSender(address: string): boolean` matches the domain or a subdomain.
  - `evaluateCompanyMail` evidence adds `"Keyword in subject or sender name"` when a keyword (or alias) matches `subject` or the new `MailEvidence.senderName`. Name in subject still counts as before.
  - When evidence exists but no job event is recognised: keep as `UNKNOWN` ("Other") if the evidence includes the exact sender, the company domain or a keyword; otherwise exclude with reason `Matched <company> by <evidence>; no job event recognised`.
  - `matchMail` returns, for the single-company exclusion case, that company's specific reason and `companyKeys: [company.id]`, never the generic "No hiring update matched…". The generic reason stays only when no company had any evidence.

- [ ] **Step 1: Write the failing tests.**
  - `company-rules.test.ts`:
    - `keyword in the sender name is company evidence`: rule keyword "Fernwood Hiring Team", sender `no-reply@ashbyhq.com`, senderName "Fernwood Hiring Team", subject "Thanks for applying" → not excluded.
    - `keyword in the body is not evidence`.
    - `domain match with hiring words but no event is kept as Other`: domain rule `northstar.example`, subject "Quick question about your notice period", body mentions "role" → destination not `excluded`.
    - `name in subject alone without an event is still dropped with a specific reason`: rule company "Amazon", subject "Amazon Sale this weekend" → reason `Matched Amazon by company name in subject; no job event recognised`.
    - `refuses generic job words in any case`: `keywordProblem("  Interview ")` is a string; `keywordProblem("Northstar Talent")` is `null`; `ruleSchema.safeParse({…, keywords: ["jobs"]}).success` is `false`.
    - `parses a legacy subjectTerms rule into keywords`.
  - `matching.test.ts`:
    - `reports the matched company's reason and key on exclusion`: Oracle rule, subject "Oracle meetup" with no event → `reason` starts `Matched Oracle`, `companyKeys` equals `["oracle"]`.
    - `keeps "Thank you for your application to Oracle"` (with Task 1's classifier) as kept for Oracle.
- [ ] **Step 2: Run them.** `npx vitest run src/features/mail/company-rules.test.ts src/features/mail/matching.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the rule shape, `keywordProblem`, `isSharedSender`, evidence and reasons above. `loadMailContext` defaults `keywords` to `[]`. Pass `senderName` from every `matchMail` caller.
- [ ] **Step 4: Run the mail tests.** `npx vitest run src/features/mail tests/mail-rule-save.integration.test.ts` (the latter via `npm run test:db -- tests/mail-rule-save.integration.test.ts`). Expected: PASS after updating the rule-save test's field names.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Match company keywords by sender name and give every drop a specific reason`.

### Task 3: One ingest path that re-decides dropped mail

**Files:**

- Create: `src/features/mail/ingest.ts`
- Modify: `src/features/mail/check-service.ts` (call `ingestPage`)
- Test: `tests/mail-ingest.integration.test.ts`, `tests/mail-check.integration.test.ts`

**Interfaces:**

- Consumes: `matchMail` (Task 2), `importMailRecords`, ledger tables.
- Produces:
  - `type IngestCounts = { fetched: number; alreadyHere: number; kept: number; dropped: number; newAttention: number }`
  - `type IngestItem = { trackingId: string; messageId: string | null; receivedAt: string; sender: string; senderName: string; subject: string; folders: string[]; kept: boolean; tag: MailTag | null; reason: string; companyKeys: string[] }`
  - `ingestPage(tx: MailTx, input: { connection: MailConnection; providerId: ProviderId; messages: ScannedMessage[]; context: MailContext; threads: { threadId: string | null; applicationIds: string[] }[]; recoveredBefore: Date | null; preferCompany?: string }): Promise<{ counts: IngestCounts; items: IngestItem[] }>`
  - Rules inside `ingestPage`:
    - A prior `kept` identity only updates folders and counts as `alreadyHere`.
    - A prior `excluded` identity is re-matched. If now kept, import it, flip the row to `kept`, set `message_id`, and count it as `kept`. If still excluded, update `reason`, `company_keys` and `evidence`, and count it as `alreadyHere`.
    - A new email received before `recoveredBefore` is imported with `attentionState: "DONE"` and `processedAt: now` and does not count toward `newAttention`.
    - With `preferCompany` set (company search) and the decision `Ambiguous company match`, re-evaluate against that company alone.
    - `items` holds this page's new or re-decided identities only, not `alreadyHere` ones.

- [ ] **Step 1: Write the failing integration tests** in `tests/mail-ingest.integration.test.ts` (synthetic `ScannedMessage`s, `jobops_e2e`):
  - `re-decides an excluded identity that now matches`: seed a ledger row `excluded` for message X; ingest X with an Oracle rule and the acknowledgement subject → ledger row `kept`, one `mail_messages` row with `company_key` "oracle".
  - `never reopens a kept identity`: a kept, handled message re-ingested stays `DONE` and creates no new row.
  - `recovered mail before the previous last fetch enters handled`: `recoveredBefore` after the message date → `attention_state` `DONE`, `newAttention` 0.
  - `mail after the previous last fetch starts open`.
  - `stores the company key and reason on still-excluded rows`.
- [ ] **Step 2: Run them.** `npm run test:db -- tests/mail-ingest.integration.test.ts`. Expected: FAIL, missing module.
- [ ] **Step 3: Move the per-message loop** from `checkConnection` into `ingestPage` unchanged in behaviour except the rules above; `checkConnection` passes `recoveredBefore: current.lastSyncedAt`.
- [ ] **Step 4: Run** `npm run test:db -- tests/mail-ingest.integration.test.ts tests/mail-check.integration.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Share one mail ingest path that re-decides dropped mail`.

### Task 4: Fetch new mail with Last N days, counts and a dropped list

**Files:**

- Modify: `src/features/mail/check-service.ts` (`checkWindow`, `checkMailStep`), `src/app/api/v1/mail/check/route.ts`, `src/features/mail/workspace-actions.ts` (`checkMail`)
- Create: `src/app/api/v1/mail/dropped/route.ts`, `src/features/mail/dropped.ts`
- Test: `src/features/mail/check-service.test.ts`, `tests/mail-check.integration.test.ts`, `tests/mail-api.test.ts`

**Interfaces:**

- Consumes: `ingestPage` (Task 3).
- Produces:
  - `checkWindow(stored: CheckProgress | undefined, releasedAt: string, now: Date, lastDays?: number): CheckProgress`. With `lastDays`, start a new window whose `since` is the earlier of `now − lastDays × 24 h` and the stored `until` (minus the one-hour overlap). It replaces any incomplete window. Without it, behaviour is unchanged.
  - `checkMailStep(options?: { lastDays?: number }): Promise<CheckResult>`, where `AccountCheck` gains `counts: IngestCounts` and `since: string`. A `lastDays` outside 1–180 throws `ApiError("Fetch goes back up to 180 days. For older mail, search a company from its page.", 400)`.
  - `POST /api/v1/mail/check` accepts an optional JSON body `{ lastDays?: number }`. An empty body still works.
  - `checkMail(lastDays?: number)` server action.
  - `listDropped(filter: { since: string; company?: string }): Promise<IngestItem[]>`: ledger rows `excluded` with `updated_at >= since`, newest first, at most 200. `GET /api/v1/mail/dropped?since=<iso>&company=<key>`.

- [ ] **Step 1: Write the failing tests.**
  - `check-service.test.ts`:
    - `last N days starts at the earlier bound`: stored until 10 days ago, `lastDays` 3 → `since` is about 10 days ago minus 1 h.
    - `last N days reaches past the last fetch`: stored until 1 h ago, `lastDays` 30 → `since` is 30 days ago.
    - `last N days replaces an incomplete window`.
  - `mail-check.integration.test.ts`:
    - `rejects 181 days` with 400 and the copy above.
    - `reports per-account counts`.
    - `moves the last fetch to the window end when complete`.
  - `mail-api.test.ts` `lists dropped mail since a time`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** `npx vitest run src/features/mail/check-service.test.ts tests/mail-api.test.ts && npm run test:db -- tests/mail-check.integration.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Fetch the last N days and list what each fetch dropped`.

### Task 5: Provider query search and single-message fetch

**Files:**

- Create: `src/services/mail/providers/search-query.ts`
- Modify: `src/services/mail/providers/types.ts`, `gmail.ts`, `outlook.ts`
- Test: `src/services/mail/providers/search-query.test.ts`, `gmail.test.ts`, `outlook.test.ts`

**Interfaces:**

- Produces:
  - `type SearchIdentity = { names: string[]; senders: string[]; domains: string[]; never: string[] }`; `type SearchRequest = ScanRequest & { identity: SearchIdentity }`.
  - `gmailSearchQuery(request: SearchRequest): string` → `-in:sent -in:drafts after:<s> before:<s> {from:"<sender>" … from:"<domain>" … subject:"<name>" from:"<name>" …} -"<never>" …`. Use second-precision bounds widened by one second; the service enforces exact bounds.
  - `outlookSearchQuery(request: SearchRequest): string` → KQL `(from:"…" OR … OR subject:"…") AND received>=<day−1> AND received<=<day+1>`, returned as a JSON-quoted `$search` value. Never-include terms are filtered locally after fetch (KQL `NOT` with `$search` is unreliable).
  - `assertPhrase(value: string): string` throws on `"`, `\` or control characters.
  - `MailProvider.searchMail(connection, request: SearchRequest, folders): Promise<{ messages: ScannedMessage[]; next?: string; query: string }>`. Gmail pages 25, Outlook 25; both include spam/junk and trash; drafts and sent are dropped.
  - `MailProvider.fetchMessage(connection, providerMessageId: string, folders): Promise<ScannedMessage | null>` (`null` on 404/410).
  - The retired builder is in git at `62b7a28^:jobops/src/services/mail/providers/search-query.ts`; reuse its quoting and Outlook day-widening.

- [ ] **Step 1: Write the failing tests.**
  - `search-query.test.ts`:
    - `builds the Gmail query for a rule`: exact expected string for names `["Northstar","Northstar Labs"]`, sender `talent@northstar.example`, domain `northstar.example`, never `["Northstar newsletter"]`, and fixed bounds.
    - `builds the Outlook query with widened days`.
    - `rejects quotes and backslashes`.
  - `gmail.test.ts` / `outlook.test.ts` (mocked `fetch`, as the existing tests do):
    - `searchMail sends the built query and returns it`.
    - `fetchMessage returns null on 404`.
    - `Outlook drops never-include matches locally`.
- [ ] **Step 2: Run** `npx vitest run src/services/mail/providers`. Expected: FAIL.
- [ ] **Step 3: Implement** the builders and both provider methods, sharing message parsing with `scanMail`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Search inboxes with a visible provider query and fetch one message`.

### Task 6: Company search service, Include this and the APIs

**Files:**

- Create: `src/features/mail/company-search.ts`, `src/features/mail/include.ts`, `src/app/api/v1/mail/company/[key]/search/route.ts`, `src/app/api/v1/mail/company/[key]/rule/route.ts`, `src/app/api/v1/mail/[id]/include/route.ts`
- Modify: `src/proxy.ts` (guard the new routes like `/api/v1/mail`), `src/features/mail/workspace-actions.ts` (server actions)
- Test: `tests/company-search.integration.test.ts`, `tests/mail-search-api.test.ts`

**Interfaces:**

- Consumes: `ingestPage` (Task 3), `searchMail`/`fetchMessage`/`gmailSearchQuery`/`outlookSearchQuery` (Task 5), `ruleSchema`/`isSharedSender` (Task 2), `listDropped` (Task 4).
- Produces:
  - `type SearchLane = { account: string; provider: ProviderId; state: "searching" | "done" | "failed"; query: string; counts: IngestCounts; items: IngestItem[]; error: string | null }`
  - `type SearchRun = { key: string; since: string; until: string; accounts: string[]; startedAt: string; finishedAt: string | null; counts: IngestCounts }`, stored at `settings` key `companySearchRun:<key>`. The cursor per inbox is stored at `companySearch:<key>:<connectionId>`.
  - `companySearchStep(key: string, options: { lastDays?: number; accounts?: string[]; restart?: boolean }): Promise<{ more: boolean; run: SearchRun; lanes: SearchLane[] }>`. Rules:
    - One page per selected inbox per call, under `withConnectionLock`.
    - `lastDays` is 1–3650, default 90 for a company never searched; otherwise since the last run's `until`.
    - `preferCompany: key` and `recoveredBefore: connection.lastSyncedAt`.
    - One inbox's failure is reported on its lane and never throws for the others.
    - Rule hits are counted per evidence type for the panel and stored with the run: `type RuleHits = { addresses: number; domains: number; keywords: number; never: number }`, where `never` counts emails left out by a Never include phrase.
  - `readCompanySearch(key: string): Promise<{ rule: CompanyMailRule; ruleSource: string; inboxes: { account: string; provider: ProviderId }[]; lastRun: SearchRun | null; ruleHits: RuleHits | null; queries: Record<string, string>; dropped: IngestItem[] }>`
  - `includeMail(trackingId: string, companyKey: string): Promise<{ item: MailItem; addedSender: string | null; skippedShared: string | null; suggestedKeyword: string | null }>`. It:
    - fetches the message with `fetchMessage`, imports it for the company (tagged by the classifier, `UNKNOWN` → Other), and flips the ledger row to `kept`;
    - adds the sender to `senders` unless `isSharedSender`, in which case it returns `skippedShared` and suggests `senderName` as a keyword when `keywordProblem` accepts it;
    - returns 409 when the identity is already kept, and 404 when the provider no longer has it.
  - Routes:
    - `GET` and `POST /api/v1/mail/company/{key}/search`, where `POST` takes `{ lastDays?, accounts?, restart? }`.
    - `PUT /api/v1/mail/company/{key}/rule`, validated by `ruleSchema` (400 with the `keywordProblem` copy).
    - `POST /api/v1/mail/{trackingId}/include` with `{ company }`.
  - Server actions `searchCompanyMail`, `saveCompanyRule`, `includeDroppedMail` wrap the same services.

- [ ] **Step 1: Write the failing tests** in `tests/company-search.integration.test.ts` (synthetic provider registered for tests, as `mail-check.integration.test.ts` does):
  - `stores kept mail for the company and ledger rows for all`.
  - `one failed inbox does not stop the others`: one synthetic connection throws "Sign-in expired" → its lane `failed` with that error, the other `done`.
  - `a repeated search changes nothing`: second run over the same window → counts all `alreadyHere`, no new `mail_messages`, `newAttention` 0.
  - `include adds a company sender`: `eng-hiring@northstar.example` → `addedSender` set, rule `senders` contains it.
  - `does not add a shared sender`: `meera.k@gmail.com` → `addedSender` null, `skippedShared` set, `suggestedKeyword` equals the sender name, rule unchanged.
  - `include refuses an already kept identity with 409`.
  - `rejects 3651 days`.
  - In `tests/mail-search-api.test.ts`: `PUT rule refuses a generic keyword with 400` and `GET search returns queries for each inbox`.
- [ ] **Step 2: Run** `npm run test:db -- tests/company-search.integration.test.ts && npx vitest run tests/mail-search-api.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the services, routes and actions.
- [ ] **Step 4: Run** the same commands. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Bring back per-company inbox search with Include this`.

### Task 7: Company status and previous jobs

**Files:**

- Modify: `src/db/schema.ts` (`companyRecords.kind`), `src/features/applications/lanes.ts` (`recordStatus` adds `accepted`), `src/features/applications/phase.ts` (`outreachSources` untouched; add `PREVIOUS_JOB` to `methodLabel`), `src/features/workspace/read.ts`, `src/features/companies/read.ts`, `src/app/api/v1/applications/route.ts` (filters), `src/features/mail/handle-service.ts` (`resolveApplication` previous-job auto-link)
- Create: `drizzle/0014_previous_employers.sql`, `src/features/companies/status.ts`, `src/features/companies/previous-job.ts`
- Test: `tests/company-status.test.ts`, `tests/previous-job.integration.test.ts`

**Interfaces:**

- Produces:
  - `companyRecords.kind text NOT NULL DEFAULT 'SHORTLIST'`, check `IN ('SHORTLIST','PREVIOUS_EMPLOYER')`.
  - `type CompanyStatusTone = "preparing" | "applied" | "quiet" | "interviewing" | "offer" | "accepted" | "closed" | "mailOnly"`; `type CompanyStatus = { tone: CompanyStatusTone; label: string; detail: string; previous: { role: string; joined: string; left: string | null } | null }`.
  - `companyStatus(input: { records: LaneSource[]; mailCount: number; previousJobs: PreviousJob[]; now: Date }): CompanyStatus`. Live records use `laneStatus`; a record closed `ACCEPTED` that is not a previous job gives `accepted` "Accepted"; no records but mail gives `mailOnly` "Mail only".
  - `type PreviousJob = { applicationId: string; companyKey: string; role: string; joinedOn: string; leftOn: string | null }` (months as `YYYY-MM`).
  - `addPreviousJob(input: { company: string; role: string; joinedOn: string; leftOn?: string; notes?: string; createCompany?: boolean }): Promise<{ applicationId: string; linked: number }>`. It:
    - creates the company with `kind: "PREVIOUS_EMPLOYER"` when `createCompany` is set and none exists;
    - creates the job with `canonicalUrl` `jobops:previous/<uuid>` and `source` `PREVIOUS_JOB`, and the application with `source` `PREVIOUS_JOB`, `status` `CLOSED` and `closedReason` `ACCEPTED`, leaving `appliedAt` and `postedAt` null;
    - writes the event `JOINED` with `{ joinedOn, leftOn }`;
    - links existing company mail tagged offer, backgroundCheck or joining that arrived before the end of the month after `joinedOn`, but only when the company has no open application.
  - `previousJobs(): Promise<PreviousJob[]>`.
  - Previous-job jobs (`canonicalUrl LIKE 'jobops:previous/%'`) are excluded from Home openings and the activity chart, from Companies saved openings and from `GET /api/v1/applications` duplicate checks. Previous jobs are excluded from `buildQueue`.

- [ ] **Step 1: Write the failing tests.**
  - `company-status.test.ts`:
    - `an accepted current offer is Accepted, not a previous job`.
    - `a company with mail and no records is Mail only`.
    - `a previous job keeps its badge beside a live status`: previous job plus an interviewing record → `tone` `interviewing` and `previous` set.
  - `previous-job.integration.test.ts`:
    - `adds a previous employer outside the shortlist`: `createCompany` → company `kind` `PREVIOUS_EMPLOYER`, application `closedReason` `ACCEPTED`, `appliedAt` null.
    - `links offer, BGV and joining mail around the joined month`: three seeded emails in Feb–Mar 2022 with joined `2022-04` → `linked` 3.
    - `does not link when the company has an open application`.
    - `previous jobs never reach Home openings or the duplicate API`.
- [ ] **Step 2: Run** `npx vitest run tests/company-status.test.ts && npm run test:db -- tests/previous-job.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Generate the migration** (`npm run db:generate`; it must only add the column and check) and implement the code above.
- [ ] **Step 4: Run** the same commands plus `npx vitest run tests/applications-api.test.ts tests/home-identity.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Add company status and record previous jobs outside the shortlist`.

### Task 8: The job-mail feed on `/mail` (picks: feed B, needs-you A, status A)

**Files:**

- Modify: `src/features/timeline/mail-data.ts`, `src/features/timeline/mail-view.tsx`, `src/features/timeline/timeline.tsx` (row component), `src/features/timeline/index-rows.ts` (status pill per row, Previous employers group), `src/features/timeline/query.ts`
- Create: `src/features/timeline/coming-up.tsx`, `src/features/timeline/source-chip.tsx`, `src/features/companies/status-pill.tsx`
- Test: `tests/mail-view-render.test.ts`, `tests/mail-view.integration.test.ts`, `tests/timeline-entries.test.ts`

**Interfaces:**

- Consumes: `TagPill` (Task 1), `companyStatus`/`previousJobs` (Task 7).
- Produces:
  - `MailViewData` gains `pane: { kind: "all" }` as the default when no `company` param (All job mail: every kept email, newest first, 50 per page via `listMail` without `company`), `comingUp: ComingUpItem[]`, and `statuses: Record<string, CompanyStatus>`.
  - `type ComingUpItem = { id: string; at: string; label: string; title: string; companyKey: string; companyName: string; tag: MailTag | null; mailId: string | null }`. Built from open emails with a known due date, booked rounds and OA deadlines within `HORIZON_DAYS` (7), sorted soonest first, plus open emails without a date at the end with label "No date".
  - `MailRow` (in `timeline.tsx`) renders the two-line row from the gallery's `TwoLineFeed`. Line one: company (bold while open), sender and, on the right, `SourceChip` plus time. Line two: `TagPill` and subject. Line three: the first line of `text`, clamped to one line. The same row serves company timelines, so `/mail` and company pages match.
  - `SourceChip({ account, folders })` shows the inbox and highlights a non-Inbox folder (Junk, Spam, Trash) with `bg-warning-soft`.
  - `StatusPill({ status })` and `PreviousBadge({ joined })` from the gallery's `shared.tsx`, using tokens only.
  - Rail: "All job mail" first, then the existing groups with a status pill on each row, then a collapsed "Previous employers" group.
  - Coming up is a horizontally scrolling strip of cards above the feed (`snap-x`), with the label as the headline.

- [ ] **Step 1: Write the failing tests.**
  - `mail-view-render.test.ts`:
    - `defaults to All job mail`.
    - `renders two-line rows with the source chip and a Junk highlight`.
    - `renders Coming up soonest first with No date last`.
    - `shows a Previous employers group collapsed`.
  - `mail-view.integration.test.ts` `All job mail lists every kept email newest first and never excluded mail`.
- [ ] **Step 2: Run** `npx vitest run tests/mail-view-render.test.ts && npm run test:db -- tests/mail-view.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, porting markup from `src/features/mail/feed-gallery/feed.tsx` (`TwoLineFeed`, `ComingUpStrip`) and `shared.tsx`. Then delete their gallery-only palette use from product code paths.
- [ ] **Step 4: Run** the same commands, `npm run typecheck` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Show every job email newest first with what's coming up on Mail`.

### Task 9: Fetch new mail control (pick A)

**Files:**

- Create: `src/features/mail/fetch-mail.tsx`, `src/features/mail/dropped-list.tsx`
- Modify: `src/features/timeline/mail-view.tsx` (replace `CheckMail`), delete `src/features/timeline/check-mail.tsx`
- Test: `tests/fetch-mail-render.test.ts`

**Interfaces:**

- Consumes: `checkMail(lastDays?)` and `listDropped` (Task 4), `includeDroppedMail` (Task 6).
- Produces:
  - `FetchMail({ inboxes: { account: string; provider: ProviderId }[]; lastFetched: string | null })`:
    - The button "Fetch new mail", with a segmented "Since last fetch" / "Last N days" control beside it. Last N days reveals a number field (1–180); above 180 it shows "Fetch reads every message, so it goes back up to 180 days. For older mail, search a company from its page."
    - Under the button, the coverage sentence: "Checks Gmail and both Outlook inboxes, every folder including Spam and Trash, for mail since <time>." (or "from the last N days"). Inbox names come from the data.
    - While running, one progress row per inbox with "Page n" / "Done, k kept" / the failure text. The client loops steps up to 20 calls and resumes on the next press, as today.
    - When finished: "<k> kept, <n> need you, <d> dropped." with "See what was dropped" opening `DroppedList` for `since = run start`, and "Reconnect <account>" for failures.
  - `DroppedList({ since: string; company?: string })` lists each dropped email (subject, sender, inbox and folder, reason) with Include this. For company-less mail, Include this first asks "Which company?" with a company picker.

- [ ] **Step 1: Write the failing tests** in `tests/fetch-mail-render.test.ts`:
  - `shows the coverage sentence with the last fetch time`.
  - `clamps above 180 and shows the company search hint`.
  - `renders one progress row per inbox and the failure text`.
- [ ] **Step 2: Run** `npx vitest run tests/fetch-mail-render.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, porting from `feed-gallery/fetch.tsx` (`InlineFetch`) with real actions.
- [ ] **Step 4: Run** the test, `npm run typecheck` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Replace Check mail with Fetch new mail and a visible dropped list`.

### Task 10: Company search panel and live run (picks: panel C, run B)

**Files:**

- Create: `src/features/mail/search/rule-panel.tsx`, `src/features/mail/search/run-lanes.tsx`, `src/features/mail/search/chips.tsx`
- Modify: `src/features/companies/detail.tsx` (`TimelineAside` hosts the panel; header shows `StatusPill`/`PreviousBadge` and "Add previous job"), `src/app/companies/[slug]/page.tsx` (read `readCompanySearch`), `src/features/timeline/mail-view.tsx` (replace "Mail rule" with a link to `/companies/<slug>?tab=timeline#mail-search`), delete `src/features/mail/company-rule-editor.tsx` and its drawer use
- Test: `tests/company-search-render.test.ts`

**Interfaces:**

- Consumes: `readCompanySearch`, `saveCompanyRule`, `searchCompanyMail`, `includeDroppedMail` (Task 6); `addPreviousJob` (Task 7).
- Produces:
  - `RulePanel({ data: Awaited<ReturnType<typeof readCompanySearch>> })`, the gallery's `CountsPanel`:
    - Rows Addresses, Domains, Names and keywords (company name fixed), Never include, Inboxes and Time frame. Each value row shows its last-search count ("5 kept", "1 left out").
    - The header shows the last search summary: "Last search 31 Oct, last 90 days: 6 kept, 6 dropped".
    - Chips can be edited in place, removed or added. Every edit saves at once through `saveCompanyRule` and shows "Saved. Fetches and searches use it from now on." A refusal shows the server's copy under the field.
    - "Show the exact search sent to each inbox" lists `data.queries`. The button reads "Search <Company>'s mail".
  - `RunLanes({ companyKey, companyName, inboxes, lastDays, accounts })`, the gallery's `LanesRun`:
    - One lane per selected inbox (three columns on wide screens, stacked on a phone). Each lane shows its state line, its counts ("n read, n already here, n kept, n dropped"), an "Exact search" disclosure and its results streaming in as `searchCompanyMail` steps return.
    - Dropped results show "Dropped: <reason>" and Include this. The note after including names the added sender, or says why a shared sender wasn't added and offers "Add “<name>” as a keyword".
    - The finished summary names any failed inbox and how to reconnect it.
  - The panel appears in the company Timeline aside under the pay and loop sections, with `id="mail-search"`.

- [ ] **Step 1: Write the failing tests** in `tests/company-search-render.test.ts`:
  - `shows each rule with its last-search count`.
  - `refuses a generic keyword with the server copy`.
  - `renders one lane per selected inbox with its query`.
  - `shows the shared-sender note and keyword offer after Include this`.
- [ ] **Step 2: Run** `npx vitest run tests/company-search-render.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, porting from `feed-gallery/search.tsx` (`CountsPanel`, chips) and `feed-gallery/run.tsx` (`LanesRun`), driven by real actions instead of the scripted run.
- [ ] **Step 4: Run** the test, `npm run typecheck` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Show and edit how each company's mail is found, and watch the search run`.

### Task 11: Add previous job and previous employer forms

**Files:**

- Create: `src/features/companies/previous-job-form.tsx`
- Modify: `src/features/companies/detail.tsx` (header action), `src/app/companies/page.tsx` ("Add a previous employer"), `src/features/companies/read.ts` (hide `PREVIOUS_EMPLOYER` from Compare, Grid and Pipeline unless it separately qualifies under the shortlist policy)
- Test: `tests/previous-job-form.test.ts`, `tests/companies.test.ts`

**Interfaces:**

- Consumes: `addPreviousJob` (Task 7).
- Produces:
  - `PreviousJobForm({ company?: { key: string; name: string } })`: role title and joined month (required, `type="month"`), left month and notes (optional). Without `company` it also asks for the company name and passes `createCompany: true`. On success: "Saved. Linked <n> emails." When `n` is 0: "Saved." No field is pre-filled with a guess.
  - The Companies page lists previous employers in their own collapsed section under the shortlist views.
  - Companies rows (Compare, Grid and Pipeline) show `StatusPill` from `companyStatus`, the same status as Mail and the company header.

- [ ] **Step 1: Write the failing tests.**
  - `previous-job-form.test.ts`:
    - `requires role and joined month`.
    - `asks for the company only from Companies`.
  - `companies.test.ts` `hides previous employers from the shortlist views` and `shows the same status pill as Mail`.
- [ ] **Step 2: Run** `npx vitest run tests/previous-job-form.test.ts tests/companies.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Record previous jobs from a company page or Companies`.

### Task 12: Applications lanes per application (pick C)

**Files:**

- Modify: `src/features/applications/lanes.ts` (`buildLanes` grouping, `LaneDot.tag`), `src/features/applications/views/lanes.tsx`, `src/features/applications/views/lane-detail.tsx`, `src/app/applications/page.tsx`
- Test: `tests/application-lanes.test.ts`, `tests/application-lanes-view.test.ts`

**Interfaces:**

- Consumes: `TagPill` (Task 1), previous-job filter (Task 7).
- Produces:
  - `buildLanes(input: { …existing; by?: "company" | "application" })`. `"application"` makes one lane per record with `key = record.id`, `company` the company name and `roles` that record alone. `/applications` passes `"application"`.
  - `LaneDot.tag: MailTag | null`, set for mail dots, both linked and pending. Pending mail suggested for a record is a dot on that record's lane, with Link in the detail panel (already supported by `PendingMail`).
  - `LanesChart` renders mail dots as `TagPill short` and the applied dot as a small neutral dot. A future round or OA deadline is a dashed ring. The Today line stays. Pressing a dot shows that email below the chart: tag, subject, sender and time.
  - Previous jobs are not lanes. A collapsed "Previous jobs (n)" list sits under the chart with role, joined and left months.
  - Lane labels show the company name with the role under it.

- [ ] **Step 1: Write the failing tests.**
  - `application-lanes.test.ts`:
    - `one lane per application when grouped by application`: two Northstar records → two lanes.
    - `mail dots carry their tag`.
    - `previous jobs are not lanes`.
  - `application-lanes-view.test.ts` `renders tag icons for mail dots and a dashed ring for what's due`.
- [ ] **Step 2: Run** `npx vitest run tests/application-lanes.test.ts tests/application-lanes-view.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run tests/application-*.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Give each application its own lane with tagged mail`.

### Task 13: Browser tests, Docker and recovery on personal data

**Files:**

- Create: `tests/e2e/job-mail.spec.ts`
- Modify: `jobops/docs/api/` (add `mail-search.md` describing the four new routes with request and response examples)

- [ ] **Step 1: Write the Playwright spec** `tests/e2e/job-mail.spec.ts` (synthetic providers, port 3211):
  - `feed shows two-line rows and Coming up`.
  - `fetch last 30 days shows per-inbox progress and the dropped list`.
  - `company panel edits a keyword, refuses "interview", and runs a search with lanes`.
  - `include this keeps a dropped email and adds its sender`.
  - `add a previous employer from Companies`.
  - `applications shows one lane per application with tag icons`.
  - `375 px has no horizontal scroll on /mail, a company page and /applications`.
- [ ] **Step 2: Run** `npm run test:e2e -- tests/e2e/job-mail.spec.ts`. Expected: PASS. Then run the whole suite with `npm test && npm run test:db && npm run test:e2e`. Expected: PASS.
- [ ] **Step 3: Rebuild Docker** with `docker compose up -d --build` from the repository root. Then open `/mail`, a company page and `/applications` in light and dark themes and check them against the gallery picks.
- [ ] **Step 4: Recovery on personal data, only after the user says go.**
  - Take a private backup in `backups/` (`pg_dump` from the postgres container) and apply migrations 0013–0014.
  - The user runs Fetch new mail for Last 30 days, then searches Oracle, Level AI, Weave, APEXX, ServiceNow and Amazon from their company pages.
  - Report what was kept and dropped per company, quoting the panel's counts.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Cover the job mail feed, search and lanes in browser tests`.
