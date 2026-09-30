# Simple job-search verification

Verified October 1, 2026 (Asia/Kolkata), on macOS with Node 24, Next.js 16.3.8, React 19.3, Tailwind CSS 4.3.3 and local PostgreSQL 17.

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
