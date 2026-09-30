# Redesign verification

Verified October 1, 2026 (Asia/Kolkata), on macOS with Node 24, Next.js 16.3.8, React 19.3, Tailwind CSS 4.3.3, and local PostgreSQL 17.

## Results

- 72 unit tests across 16 files passed.
- All 19 Chromium browser workflows passed (31.1 seconds), including five new core-workflow tests. The six protected API checks are intentionally skipped in browser-only mode and run separately with a test workspace key.
- All six protected API integration checks passed (6.5 seconds).
- Strict typechecking and ESLint passed.
- Production build passed with Turbopack in the fresh ignored `.next/production-check` directory (`JOBOPS_BUILD_DIR=.next/production-check npm run build`). The first sandboxed build could not bind the compiler port; its default output directory retained that failure. A fresh build with local-process permission compiled successfully.
- Desktop dark/light screenshots and the task drawer were inspected. Core pages fit a 390-pixel viewport, the drawer closes with Escape and restores focus, and theme selection persists across reloads.
- Home, My profile, Opportunities and Inbox return HTTP 200 on the running development app at `http://127.0.0.1:3210`.
- The additive migration applied to the normal and isolated databases. A final read-only check found all 23 normal application tables empty. No fixtures were added to the personal workspace.

## Covered behavior

Browser checks cover editable preference snapshots, custom goals, profile links and improvement notes attached to showcase work, original PDF upload, draft revision review, explicit current-version approval, inbox attention actions and original-message retention, plus existing jobs, imports, application timelines, resume history, mission evidence, profile differences, contacts and mail review.

Protected API checks cover missing/wrong/cross-task credentials, inaccessible browser approval controls, a real approval Server Action replay at public unlock endpoints, scoped resume downloads, rejected forged approvals, immutable request IDs, concurrent credential replacement, concurrent draft-upload retries, explicit resume promotion, stale-proposal rejection, revised application reuse, changed destination rejection, preservation of advanced application stages, opportunity synchronization and closed-task decisions. API requests never approve themselves.

Tests use only the marked `jobops_e2e` database, loopback port 3211, `.next-e2e` and `data/e2e-uploads`. Existing test fixtures remain isolated; tests do not drop, reset or seed the personal database.

## Integration setup still required

The local workspace currently has no `JOBOPS_ACCESS_TOKEN` or Google OAuth credentials. Browser/manual handoffs work; task bearer access requires a private workspace key and browser unlock. Settings explains the setup. The workspace key must not be shared with an assistant; task credentials are separate, scoped and revocable.

Live Gmail OAuth and refresh need a real read-only Google connection and have not been exercised against a personal mailbox. Deterministic classification, import/review, encryption and read-only scope checks are tested. Notifications work while Home or a task page is open and visible; closed-app background push is not implemented.

JobOps does not invoke an LLM or operate external portals. No real applications, messages, profile edits or publications were performed during verification. An external assistant must reach the app origin to use its API; unreachable local instances support manual result entry.
