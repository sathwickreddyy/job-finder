# Mobile essentials implementation plan

> **For agentic workers:** Use superpowers:executing-plans in this session; one independent review after implementation. No new worktree is needed: reuse the current checkout and `codex/mobile-essentials` branch.

**Goal:** Ship the approved iPhone workflow and remove the galleries.

**Architecture:** Responsive presentation over existing application and mail records and server actions. Keep desktop behavior. Add a small read model for attention mail and analytics; share existing journey and handling rules.

**Tech stack:** Existing Next.js, React, Drizzle/PostgreSQL, Tailwind tokens and Vitest/Playwright.

**Spec:** `docs/superpowers/specs/2026-11-02-mobile-essentials-design.md`

## Global constraints

- Below 768px, show Overview, Mail and Applications only in primary navigation.
- Use Asia/Kolkata calendar boundaries, real records, and existing actions.
- All UI/API servers run in Docker. Test writes target marked `jobops_e2e` only.
- Commit each verified unit with `JOB_FINDER-9999` and the Codex coauthor footer.
- Preserve unrelated existing changes to the root AGENTS.md and local configuration.

## Review focus

- Unknown sent dates must not become invented chart activity.
- Excluded and handled mail must stay out of the attention queue, including pagination.
- An explicitly opened handled email must retain the existing Undo restrictions.
- Outcome saves must keep the open application and its forms stable.
- Safe areas, long company names and large text must not cause horizontal scrolling.

### Task 1: Mobile overview and navigation

**Files:** create `src/features/mobile/analytics.ts`, `analytics-view.tsx`, `overview.tsx`, `read.ts`, `attention-feed.tsx`; update app shell, root layout, home page and mail handling label.

**Interfaces:** `mobileAnalytics(records, now)` produces real totals and 7/28-day series; `readAttentionMail(query)` produces mail entries, handling suggestions, count and next cursor. Existing actions own all writes.

- [ ] Add failing analytics tests for IST midnight, inclusive ranges, unknown dates, outreach and previous employment.
- [ ] Implement the read model and responsive shell/overview; preserve desktop home content.
- [ ] Verify unit tests, typecheck and lint. Commit the usable overview/navigation unit.

### Task 2: Mobile mail and application journeys

**Files:** update mail page, application list/page, shared journey track and FetchMail; create mobile mail workspace and flat application list.

**Interfaces:** Existing `MailItem`, `Handling`, `Journey` and `Lane` remain authoritative; `/mail?mail=...` and `/applications?open=...` retain exact records and actions.

- [ ] Verify attention-only paging and excluded-mail behavior against the marked test DB.
- [ ] Render compact mail with actual handling, tags, refresh and Undo after a save.
- [ ] Render one flat mobile application list with circle journeys, correct rejection stops and in-place details; retain desktop grouping.
- [ ] Verify focused regression tests and browser behavior in Docker. Commit this workflow unit.

### Task 3: Remove galleries and finish

**Files:** remove `src/app/gallery` and demo-only feature trees; update live links, stale styles, README, browser tests and project-local instructions. Keep shared resume components and prompt exports used by production/tests.

- [ ] Trace gallery imports before deleting; ensure no production dependency is deleted.
- [ ] Run unit tests, lint, typecheck, build and scoped DB integration tests.
- [ ] Review with a fresh agent; fix material findings.
- [ ] Check iPhone widths and desktop, both themes, real-data read-only smoke checks and retired gallery URLs. Commit cleanup and report.

## Execution ledger

- Baseline: 84 test files / 727 tests passed; 19 files / 166 DB tests skipped as designed.
- Gallery committed as `f6ce07d` before implementation. Existing root AGENTS.md and local config changes remain outside this work.
- Ruling: approved design plus “lets implement” is the review gate; continue without another approval prompt.
