# JobOps verification

Verified October 1, 2026 (Asia/Kolkata), on macOS with Node 24, Next.js 16.3.8, React 19.3, Tailwind CSS 4.3.3 and local PostgreSQL 17.

## Structured company research tables

- Company pages display Compensation, Interview details and Interview questions as separate semantic tables with publication year and source references. Empty tables have explicit empty states; missing values are never fabricated. Other research categories use report/details/reference tables.
- All categories accept validated `data.publicationYear` and `data.publishedAt`; conflicting years are rejected. Event and observation dates remain separate. INR pay uses Indian number formatting, preserves zero and distinguishes annual amounts, one-time bonus and equity as reported.
- Questions can be strings or structured objects with text, topic, round and HTTP(S) reference URL. Nested round questions retain their round and prefer question references, then round references, then the report. Original report data remains available in a disclosure.
- All 144 unit tests, strict TypeScript, ESLint and the production build passed. All ten targeted company browser/API checks passed, including publication years, source links, structured and legacy questions, observation history, exact README payloads, mobile fit and native horizontal keyboard scrolling.
- The populated mobile table screenshot was inspected at a 390-pixel viewport. Synthetic reports were confined to the ownership-marked `jobops_e2e` database; the live Google record had no research, and no personal records were modified.
- README and generated API schemas document publication metadata and structured questions for external browser-control ingestion.

## Clickable company cards and dedicated company pages

- Each directory card is one keyboard-accessible link to `/companies/{slug}?city={city}`. Careers and resume actions live on the company page; there are no nested interactive controls inside the directory link.
- The detail page combines portal notes, careers/website links, aliases, source-labelled locations and research, all company openings/application records, and separate city resume references. The clicked city's resume reference appears first. Missing companies return 404.
- 138 unit tests, strict TypeScript and ESLint passed. All ten targeted company browser/API integration tests passed, including mouse/Enter navigation, mobile fit, resume persistence/revision behavior, submitted-file retention, sourced API research on the detail page and exact README payloads.
- The mobile detail screenshot was inspected at a 390-pixel viewport. Gathered research leads the mobile content; the careers action remains at the top. No personal database records were changed by this verification.
- The production build passed in `.next-e2e`. The live LAN directory and Google/Amazon detail pages returned HTTP 200; the directory contains company links and the Open careers action appears on the company page.
- Company REST mutations and resume-reference saves invalidate both the directory and corresponding detail page. README browser-agent guidance now directs agents to verify research on the company page.

## Company ingestion and LAN delivery

- Strict TypeScript, ESLint, 137 unit tests across 21 files and Git whitespace checks passed.
- The complete integration suite passed all 27 workflows. After final validation/documentation changes, all eight company API integration tests passed, including the exact JSON payloads embedded in README curl commands.
- The final production build passed using `JOBOPS_BUILD_DIR=.next-e2e npm run build`, separate from the running personal dev server.
- Additive company/location/fact/observation migrations applied successfully to both personal and marked isolated test databases. The existing eight real companies and 14 reviewed location records were preserved. No research, opening, salary or application activity was fabricated.
- API integration covers idempotent POST, partial PATCH, recursively merged research, fact revision snapshots, city-only updates, ambiguous locations, renamed-company matching, archive, include/city filters, concurrent alias conflicts, batch rollback, body limits, source validation and OpenAPI export. Hydrated sourced research is also checked on the actual Companies page.
- Resume/application browser workflows verify the approved separate Bengaluru/Hyderabad cards and preserve the exact submitted PDF while the preferred resume reference follows the current revision.
- The live listener was verified as `*:3210`. Companies, company lists and OpenAPI returned HTTP 200 through both `http://127.0.0.1:3210` and `http://192.168.0.5:3210`. Both hosts returned eight Bengaluru and six Hyderabad companies, with `private, no-store` responses.
- The personal fixture-cleanup preview found zero removable demo records. The normal seed command added nothing; the fictional test seed was deliberately invoked against the personal configuration and refused before connecting/writing. Test fixtures remain confined to the marked test database.
- Host checks classify the requested target, not the client source. Local company ingestion needs no token; the trusted router/firewall remains the network boundary. Public-host authentication and browser-origin/server-action checks retain regression coverage.

## Earlier simple-workflow delivery

The results below describe the earlier delivery and its database audit at that time.

## Results

- 83 unit tests across 19 files passed.
- All 18 Chromium browser workflows passed (26.2 seconds), including the retired endpoint/origin-protection checks. No tests were skipped.
- ESLint, strict TypeScript, full Prettier check and Git whitespace checks passed.
- The production build compiled successfully in the ignored isolated directory with `JOBOPS_BUILD_DIR=.next/production-check npm run build`. Next.js also completed its build-time TypeScript check.
- Desktop dark/light Home and mobile Home/Find screenshots were inspected. The core pages fit a 390-pixel viewport, theme selection persists after reload, and no browser page errors occurred.
- Home, Find, saved openings, new description, resume library/prompt, applications, My sites and Inbox returned HTTP 200 on the actual dev app at `http://127.0.0.1:3210`.
- The additive resume migration applied to both databases. A read-only personal audit found 24 application tables, with no job, application, resume, profile or mail rows. Retained historical mission/activity records were not removed or seeded by verification.
- A fresh read-only review found five important correctness gaps. All were fixed and re-reviewed; no outstanding review findings remain.

## Covered behavior

Browser tests exercise actual clipboard contents and prompt editing; persistent preferences and website links; profile improvement context; full descriptions and duplicate-aware bulk import; original and revised PDF downloads preserving bytes; parsing failure retaining the original; bullet notes remaining distinct when switching files without reload; sourced assessments tied to the original description after a later edit; and exact company/role file usage.

Application tests distinguish sent outreach from direct submission. They cover a planned outreach record becoming sent in place, including when its existing prompt is reopened; retention of its selected file; a real historical submission date on a prepared direct application; frozen submitted resume selection; interview stages; and appropriate application counts. Saved search criteria and India calendar/future-date validation have domain regression tests.

Inbox tests preserve the original message through done/reopen, show date-based attention items, and link imported mail without silently changing an application stage. Settings preserve explicit UNKNOWN answers. Retired task APIs return 410 for reads/writes, and origin/Server Action protections still reject forged requests.

Tests use only the marked `jobops_e2e` database, loopback port 3211, `.next-e2e` and `data/e2e-uploads`. They never seed, drop or reset the personal database. Synthetic companies, PDFs and messages remain confined to this test environment.

## Integration limits

Live Gmail OAuth and refresh need your read-only Google connection and were not tested against a personal mailbox. Local import/classification/linking, encryption and read-only scope checks are covered. The main workspace currently has no Google OAuth credentials.

The app supplies prompts and records outcomes. It does not invoke an LLM, read external assistant memory, apply on job sites, send messages or publish profile changes. No real external submissions or messages were performed during verification. On-demand Inbox refresh is available after connection; closed-app push notifications and automatic background mail refresh are outside this delivery.

Follow the [first-opening walkthrough](../README.md#your-first-opening-step-by-step) on the real app. Fill it with your own links, resume and first verified Indian opening; no demonstration data is required.
