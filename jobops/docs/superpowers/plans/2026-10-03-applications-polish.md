# Applications remaining fixes

**Goal:** Make stacked-event previews readable and resolve the reported keyboard, mobile, mail and notes defects without replacing the approved lanes layout.

**Approach:** Keep the pure lane model and server actions. Send structured preview entries to the chart, contain edge stacks, restore focus locally, and measure actual notes overflow. Use the existing Docker app and a disposable Docker browser-test container with the marked `jobops_e2e` database.

**Spec:** `../specs/2026-10-03-applications-lanes-design.md`, plus the user's remaining-issues list and hover screenshot.

## Constraints

- Preserve manual mail decisions, existing record history and confirmed personal data.
- Theme tokens only; retain the approved calendar and Emails drawer.
- The user authorized frequent local commits. Pushes and branch deletion still require explicit authorization.
- No host application or test servers; do not change shared infrastructure.

## Tasks

- [x] Add failing unit regressions for acknowledgement next steps, pending mail on closed companies, structured stack entries and future edge stacks.
- [x] Add browser regressions for formatted hover/focus preview, Escape, phone clipping, keyboard save focus, drawer focus and actual note overflow. Run them against the current code inside Docker.
- [x] Fix `features/applications/lanes.ts`: pending mail drives next steps independently of the queue; closed companies with pending mail stay actionable; structured preview entries and separate Earlier/Later stacks preserve dates.
- [x] Fix `views/lanes.tsx`: bounded event preview with title, time, scope and detail per event; remove duplicate live announcements; isolate track stacking and inset edge dots.
- [x] Fix `views/emails-drawer.tsx`, `views/outcome-chips.tsx` and `views/lane-detail.tsx`: restore focus to a surviving trigger or labelled progress section, without jumping to the top or stealing focus on lane navigation.
- [x] Fix `views/notes-text.tsx`: show expansion only when the rendered four-line preview overflows, including after resizing.
- [x] Run unit tests, lint, typecheck and the full browser suite; review the diff, rebuild Docker, visually check the saved-event preview with existing records.
- [x] Record verification results and create authorized project-key commits.
- [ ] Delete the merged local branch only after the user confirms; the confirmation question is pending.

## Review focus

- Long notes and six or more events must not shift the chart or overflow the phone viewport.
- Keyboard preview must use one accessible announcement and Escape dismissal.
- Far-future dates must retain their actual dates and never masquerade as this week's dates.
- Closed records remain closed even while new matched mail makes their lane actionable.
- Focus must survive changing available outcomes and URL-selected panels after saving.

## Verification record

- Four model regressions failed before the fixes and pass afterward. Final unit suite: **486 passed across 56 files**; lint and typecheck passed.
- Final full browser suite: **164 passed** against a fresh, marked `jobops_e2e` database in a disposable Docker PostgreSQL container. Existing databases and personal records were preserved.
- All **20 lane browser tests** passed, including structured previews, Escape/focus, mobile stacking, notes overflow, keyboard save focus, drawer focus, future edge targets and closed-company acknowledgement linking.
- Independent review identified overlapping edge targets and the gap above short previews; both were reproduced and corrected. A delayed scroll event dismissing a newly opened preview was also reproduced and fixed by checking whether its anchor actually moved. Seven-event previews remain scrollable and dismiss when their lane moves.
- Existing browser save checks now wait for the loading overlay to release editing/focus and distinguish saved feedback from loading status. The affected tests passed repeated checks and the final full run.
- The production Docker build succeeded; app and database were healthy at `http://127.0.0.1:3210`. The real APEXX stack displayed six structured events with no browser exceptions or viewport overflow.
- Screenshot: local artifact `applications-event-preview.png` in the session visualization directory; personal record content is not committed.
- Local commits: `179dd56` (browser save checks) and `b141c3f` (Applications fixes and regressions), both with the project key and Codex co-author footer. Nothing was pushed.
- `applications-lanes` is an ancestor of `main`. It is retained while explicit deletion confirmation is pending.
