# Resume Redesign Implementation Plan

**Goal:** Apply approved A/B/A layouts to the existing resume workflow.
**Architecture:** Keep server routes and save actions; share exact-version presentation data with the gallery. Client controls handle search and the native upload drawer; version/detail navigation remains URL-backed.
**Tech Stack:** Next.js, React, TypeScript, PostgreSQL/Drizzle, Tailwind 4.
**Spec:** ../specs/2026-10-03-resumes-redesign.md

## Constraints

- User approved the visual direction; implement inline without another design gate.
- Keep existing actions and personal records intact. No commits without explicit request.
- Isolated browser tests only: jobops_e2e, port 3211, data/e2e-uploads.

## Review focus

- Switching files must not carry another version's edited notes or assessments.
- New/default files must not alter existing application references.
- Empty and archived families must remain accessible.
- Upload errors must preserve the file and entered form values.
- Old tab/version links and unavailable PDF viewers need working paths.

## Tasks

- [x] Update the existing resume browser test for drawer upload, applications-first details, per-version rows and search; observe failure before implementation.
- [x] Add shared presentation mapping and selected list rows in src/features/resumes. Preserve gallery layouts through optional production controls.
- [x] Add a production upload drawer using quickResumeUpload and uploadVersion, with PDF/drop validation and secondary settings.
- [x] Apply details B in src/app/resumes/[id]/page.tsx while retaining assessments, changes, parsing and archive/default forms.
- [x] Run npm run typecheck, targeted ESLint and isolated resumes/companies browser tests. Review the real Oracle record read-only in the browser.
- [x] Record approved layout in AGENTS.md and propose JOB_FINDER-9999 commit after verification; do not commit.

## Verification

209 unit tests passed; typecheck and targeted lint passed. Resume browser checks passed (3), including upload redirects, exact version history, archived files, parsing failure and narrow-screen keyboard interaction. Company browser checks passed (2), including current-reference versus submitted-version preservation. Production build passed with Next.js webpack; Turbopack’s local CSS worker could not bind a port in this environment. No dependency or build-script changes were needed. Personal Oracle history was inspected read-only. No commit was created.
