# Implementation plan

Approved direction: [Action home design](../specs/2026-10-01-action-home-design.md).
Execute in this workspace, with logical verified commits as requested by the user.

1. **Theme and navigation.** Centralize semantic palette/canvas/depth tokens;
   map them to Tailwind. Implement persisted dark/light theme, narrow-screen
   navigation, Home/Opportunities/Inbox/My profile. Verify theme persistence,
   typechecking and responsive shell.
2. **Task domain and API.** Reuse missions, add scoped credentials, immutable
   proposals and decisions. Shared Zod validation/services serve browser actions and
   narrow authenticated API routes. Add non-destructive migration. Test invalid
   credentials, cross-task isolation, idempotency and approval binding.
3. **Core workflow UI.** Build selected action home, editable starters/custom tasks,
   preference snapshots, handoff, progress, review/feedback and persistent history.
   Add simple profile/resume entry and proposal upload/review. Connect opportunity
   route choices and discovery imports to existing entities.
4. **Inbox.** Reuse read-only Gmail refresh. Add date groups, attention reasons and
   completion state on messages; show actionable items on Home. Verify IST boundaries
   and acknowledged/rejected mail does not look like an urgent task by default.
5. **Verification and documentation.** Run format/lint/types/unit/build and isolated
   E2E checks. Review browser screenshots in both themes and narrow widths. Document
   API/handoff/access limitations. Commit each coherent unit; leave main data empty.
