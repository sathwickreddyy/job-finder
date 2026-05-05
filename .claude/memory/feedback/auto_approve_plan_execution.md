---
name: Auto-approve plan execution — don't pause between subagent tasks
description: When executing a clear, well-reviewed plan in job-finder, run all tasks end-to-end without pausing for per-task approval; user reviews functionality after the whole plan completes
type: feedback
---

When executing an implementation plan that has already been reviewed and approved (spec → plan → user sign-off), do NOT pause between tasks asking "approve to proceed." Run the whole plan end-to-end.

**Why:** User explicitly said: "auto approve - dont wat for my responses - i dont have that much patience to veiew it. Once all task completed then will review the functionality. I think spec and esign is clear right and u are Opus - i trust u". Stopping every few minutes for approval wastes their attention; they want one big review at the end when the app is runnable.

**How to apply:**
- After a subagent reports DONE + both review gates pass, immediately mark the task complete and dispatch the next one. No "Approve to proceed?" question.
- Skip per-task narrative updates. Compressed progress updates only at phase boundaries (e.g., "Phase A complete: 6 tasks, all green, moving to Phase B") or when something requires attention.
- DO stop if: (a) a subagent reports BLOCKED or NEEDS_CONTEXT, (b) a reviewer finds real issues that the implementer can't self-fix in one round, (c) tests that were passing start failing, (d) a task discovers that the plan is wrong. Surface the problem with options, don't silently push past.
- At the end of the plan: present a consolidated summary — what was built, what runs, what tests pass, any deviations from the plan — and propose feature-level commit bundles for approval.
- Keep working in the main branch (not a worktree) since commits are deferred to the end per `subagent_execution_style.md` — no parallel-write risk.
