# Home Redesign Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to complete the saved implementation and request independent subagent reviews. Steps use checkbox syntax. User has authorized implementation; do not pause for another design approval. Do not commit unless explicitly requested.

**Goal:** Complete the approved identity card A, live profile mosaic B, job-site cards A, loading popup A and shape-morph buttons C.

**Architecture:** Apply the reviewed saved patch in responsibility-sized groups, then add deterministic browser tests and fix review findings. Keep third-party embeds browser-side, the existing gallery unchanged, and recorded activity sections intact.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind 4, PostgreSQL/Drizzle, Vitest and Playwright. No new dependencies.

**Spec:** `jobops/docs/superpowers/specs/2026-10-01-home-redesign-design.md`

## Global Constraints

- All colours use existing theme tokens. No new dependencies.
- All embeds load in the browser. The server makes no new external requests and stores nothing new.
- Browser tests use only the marked local `jobops_e2e` database, port 3211 and `data/e2e-uploads`.
- The approved `/gallery/home` remains unchanged as a visual reference.
- Keep production port 3210 running and preserve unrelated Companies research edits.
- Faster tasks never show the popup: unit tests own the under-200-ms check.
- Only commit when explicitly requested; suggested key is `JOB_FINDER-9999`.

## Review Focus

- Malformed or misleading public profile URLs must not become unsafe embeds or badge script markup (task 1/3).
- Rapid or overlapping navigation and saves must ignore stale completion and release inert state (task 2/4).
- Broken public images and absent links must display useful fallbacks (task 3/5).
- Dialog close, Escape and backdrop interactions must restore keyboard focus (task 3/5); cross-origin iframe keyboard events may stay inside the frame.
- Slow action responses, redirected saves and GET navigation must not leave a blocking popup behind (task 4/5).

## Applying the saved code

Run patch commands from the repository root. Run npm commands from `jobops/`. The saved patch is the complete source for tasks 1–4; apply it once. If already applied, use `git apply --reverse --check` to verify rather than reapplying. Review fixes may supersede individual patch hunks; the live files are authoritative after those fixes.

```sh
git apply --check jobops/docs/superpowers/plans/2026-10-01-home-redesign-verified.patch
git apply jobops/docs/superpowers/plans/2026-10-01-home-redesign-verified.patch
```

### Task 1: Identity, profile links and job searches

**Files:**

- `jobops/src/features/workspace/identity.ts`
- `jobops/src/features/workspace/profile-links.ts`
- `jobops/src/features/workspace/job-sites.ts`
- `jobops/src/features/workspace/read.ts`
- `jobops/tests/home-identity.test.ts`
- `jobops/tests/profile-links.test.ts`
- `jobops/tests/job-sites.test.ts`

**Interfaces:** identityFrom(profile), profileLinks(links), jobSiteAction(site, role, city); readWorkspace() exposes identity and currentResume.

- [x] Restore this task’s exact code from the saved patch (or use the single full-patch command above):

```sh
git apply --include='jobops/src/features/workspace/identity.ts' --include='jobops/src/features/workspace/profile-links.ts' --include='jobops/src/features/workspace/job-sites.ts' --include='jobops/src/features/workspace/read.ts' --include='jobops/tests/home-identity.test.ts' --include='jobops/tests/profile-links.test.ts' --include='jobops/tests/job-sites.test.ts' jobops/docs/superpowers/plans/2026-10-01-home-redesign-verified.patch
```

- [x] Inspect each restored file against the spec; test invalid URLs, missing profile data, and stale loading tokens in the owning unit suite.
- [x] Run verification from `jobops/`:

```sh
npm test -- tests/home-identity.test.ts tests/profile-links.test.ts tests/job-sites.test.ts
```

Expected: exit 0; all applicable assertions pass.

### Task 2: Loading controller and navigation filters

**Files:**

- `jobops/src/components/loading/controller.ts`
- `jobops/src/components/loading/routes.ts`
- `jobops/tests/loading-controller.test.ts`
- `jobops/tests/loading-routes.test.ts`

**Interfaces:** createLoadingController() supplies token-based start/finish/reset/subscribe/getSnapshot; navigationTarget() and labelForPath() filter and label internal navigation.

- [x] Restore this task’s exact code from the saved patch (or use the single full-patch command above):

```sh
git apply --include='jobops/src/components/loading/controller.ts' --include='jobops/src/components/loading/routes.ts' --include='jobops/tests/loading-controller.test.ts' --include='jobops/tests/loading-routes.test.ts' jobops/docs/superpowers/plans/2026-10-01-home-redesign-verified.patch
```

- [x] Inspect each restored file against the spec; test invalid URLs, missing profile data, and stale loading tokens in the owning unit suite.
- [x] Run verification from `jobops/`:

```sh
npm test -- tests/loading-controller.test.ts tests/loading-routes.test.ts
```

Expected: exit 0; all applicable assertions pass.

### Task 3: Home components and live previews

**Files:**

- `jobops/src/features/workspace/embeds.tsx`
- `jobops/src/features/workspace/identity-card.tsx`
- `jobops/src/features/workspace/profile-mosaic.tsx`
- `jobops/src/features/workspace/sites.tsx`
- `jobops/src/features/workspace/home.tsx`

**Interfaces:** IdentityCard and ProfileMosaic consume WorkspaceData; PreviewDialog owns modal focus and sandboxed browser embeds.

- [x] Restore this task’s exact code from the saved patch (or use the single full-patch command above):

```sh
git apply --include='jobops/src/features/workspace/embeds.tsx' --include='jobops/src/features/workspace/identity-card.tsx' --include='jobops/src/features/workspace/profile-mosaic.tsx' --include='jobops/src/features/workspace/sites.tsx' --include='jobops/src/features/workspace/home.tsx' jobops/docs/superpowers/plans/2026-10-01-home-redesign-verified.patch
```

- [x] Inspect each restored file against the spec; test invalid URLs, missing profile data, and stale loading tokens in the owning unit suite.
- [x] Run verification from `jobops/`:

```sh
npm run typecheck
```

Expected: exit 0; all applicable assertions pass.

### Task 4: App-wide loading and shape feedback

**Files:**

- `jobops/src/components/loading/overlay.tsx`
- `jobops/src/components/action-form.tsx`
- `jobops/src/components/app-shell.tsx`
- `jobops/src/components/ui/button.tsx`
- `jobops/src/features/jobs/import-form.tsx`
- `jobops/src/app/globals.css`
- `jobops/src/styles/theme.css`

**Interfaces:** LoadingProvider mounts outside inert content; useLoadingTask(pending,label) binds server actions; useLoading() starts redirect navigation; morph is shared CSS.

- [x] Restore this task’s exact code from the saved patch (or use the single full-patch command above):

```sh
git apply --include='jobops/src/components/loading/overlay.tsx' --include='jobops/src/components/action-form.tsx' --include='jobops/src/components/app-shell.tsx' --include='jobops/src/components/ui/button.tsx' --include='jobops/src/features/jobs/import-form.tsx' --include='jobops/src/app/globals.css' --include='jobops/src/styles/theme.css' jobops/docs/superpowers/plans/2026-10-01-home-redesign-verified.patch
```

- [x] Inspect each restored file against the spec; test invalid URLs, missing profile data, and stale loading tokens in the owning unit suite.
- [x] Run verification from `jobops/`:

```sh
npm run lint
```

Expected: exit 0; all applicable assertions pass.

### Task 5: Deterministic browser coverage and spec alignment

**Files:**

- `jobops/scripts/seed-test.ts`
- `jobops/tests/e2e/helpers/external-sites.ts`
- `jobops/tests/e2e/home.spec.ts`
- `jobops/tests/e2e/simple-home.spec.ts`
- `jobops/docs/superpowers/specs/2026-10-01-home-redesign-design.md`

**Interfaces:** stubExternalSites(page) blocks public hosts with local fixtures; fixtures remain confined to the marked jobops_e2e database.

- [x] Add idempotent fictional `GitHub`, `Portfolio` and `Medium` records to the seed only when their stable IDs are missing. Use `demo-jobops`, `https://portfolio.example.invalid/`, and `https://medium.com/@demo-jobops`; retain existing fixtures.
- [x] Implement `stubExternalSites(page: Page): Promise<void>` with Playwright browser-context route interception for every outside HTTP host and service workers blocked in the test configuration, supplying deterministic SVG/HTML responses and aborting unexpected hosts. Serve the official badge script locally; never contact real sites.
- [x] Add `home.spec.ts` assertions for identity, profile chips, search URLs, preview focus, Escape/backdrop/close, image failures, sandboxed LinkedIn fallback, slow navigation, slow save and redirect, and mobile overflow in both themes. Delay only local RSC/action responses, never actual external requests.
- [x] Update `simple-home.spec.ts` to expect `Your profiles` and scope saved-link assertions to tile headings.
- [x] Amend the spec: Open/Preview controls morph; import save shows `Saving jobs`; gallery stays unchanged; the fast-loading check lives in Vitest.
- [x] Run the complete checks from `jobops/`:

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Expected: all commands exit 0. Fix actual failures before completion.

## Visual comparison and review

- [x] Open `/gallery/home` and `/` in the isolated browser-test server at 3211. Use the same theme and viewport (desktop 1440×1000 and mobile 390×844).
- [x] Capture screenshots of Hero A, Previews B, Job sites A, Loader A and Button C, and screenshots of the corresponding Home components. Compare composition, spacing, hierarchy, button pressed states and popup blur. Fixture content and finite morph radii legitimately differ from the gallery.
- [x] Request separate subagent reviews of the spec/requirements and implementation. Fix concrete findings, add focused regression coverage, and rerun relevant checks.
- [x] Confirm `git diff -- src/features/workspace/home-gallery` is empty and Companies research files are untouched by this work.
- [x] Verify the saved patch preserves the scratch worktree’s implementation before removing only that scratch worktree. Stop only the gallery process on 3212; leave production on 3210 alone.

## Completion record

Implementation, review findings, verification results and cleanup status are recorded here as work proceeds. The saved patch is a recovery artifact, not a second source of truth.

### Completed on 2026-10-01

- Applied all 23 files from the saved implementation patch. Added isolated fictional profile fixtures, shared context-level external-site stubs, Home browser tests and updated existing Home assertions.
- Independent spec and implementation reviews found hash-only history starting a popup without completion, and long dialog headers shrinking the close control. Both had browser tests observed failing before the fixes and passing afterward.
- Browser logs exposed duplicate saved URLs sharing React keys. Production links now preserve every saved record with distinct stable chip and preview keys; the focused unit test was observed failing before the fix and passing afterward.
- The browser-test helper now intercepts requests at context level, including the first request of new tabs, and blocks service workers. The real open-in-new-tab browser test passes with locally served fictional portfolio HTML.
- Verification: typecheck and lint passed; all 209 unit tests passed; all 40 browser tests passed in the marked isolated database. A legacy mobile-navigation test was updated from the removed generic Home heading to the stored identity heading.
- Production build passed with `JOBOPS_BUILD_DIR=.next-home-build npm run build -- --webpack`. Default Turbopack could not bind its internal local port in this execution environment; no app/build configuration was changed to work around it. The temporary build directory and its generated tsconfig includes were removed afterward.
- Desktop/mobile light/dark Home screenshots and both gallery themes were captured. Files are available in `/private/tmp/jobops-home-review/` and in the last browser run’s `test-results`. Compared the identity-card hierarchy, mosaic geometry, icon-card spacing and tonal surfaces against the approved gallery; the persistent test database has many old fictional links, so screenshot content is more extensive than the original fixtures.
- Gallery component files and `/gallery/home` route are unchanged. The original gallery already used AppShell; it keeps that existing composition. The two existing gallery routes that bypass AppShell still bypass production loading.
- Verified all 23 scratch-worktree files matched the saved patch before deleting that scratch worktree. Only the main worktree remains; gallery 3212 and test 3211 are stopped. Production server 3210 still has its original PID.
- No commits were created. Existing Companies research changes were preserved.

### Decisions and browser limits

- Keep the fast-task/nonappearance test in the timer-controlled unit suite, as explicitly requested in the handoff; a timing-sensitive dev-server navigation test would not reliably measure the 200 ms controller rule.
- Escape closes a preview while focus is on JobOps dialog controls. Cross-origin iframe interaction may retain keyboard events inside that frame, which the parent cannot intercept; the close control and backdrop remain available. The spec and browser tests document this limitation without changing portfolio interactivity or sandbox permissions.
- Keep the original saved patch as the recovery starting point. Live source includes subsequent review fixes and browser coverage; those live files are the completed implementation.
