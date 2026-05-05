---
name: Subagent execution style for this project
description: For multi-task plans in job-finder, run subagents sequentially with opus, defer commits to end-of-plan per-feature bundles, enforce TDD+BDD in every subagent
type: feedback
---

When executing implementation plans with multiple tasks in the `job-finder` project, follow this exact execution protocol:

1. **Subagent model:** always `opus` (sonnet/haiku are not strong enough for the reasoning-heavy tasks in this repo). Specify `model: "opus"` on every `Agent` tool call.

2. **Sequential execution:** dispatch ONE subagent at a time. Review its output with the user. Only advance to the next task after explicit approval. No parallel subagents when the plan is a sequential chain — parallel is reserved for independent tasks.

3. **Review gate between tasks:** after each subagent returns, present a concise summary (what it built, what tests ran, what passed, any deviations from the plan) and ask the user to approve advancing to the next task. Do not auto-advance.

4. **Testing discipline:** every subagent must produce TDD (failing test → impl → passing test) as written in the plan, PLUS add BDD-style scenario tests where the behavior is user-facing (API responses, UI interaction flows, CLI commands). Unit tests alone are insufficient for user-facing surfaces.

5. **Commit strategy — defer to end:** subagents must NOT run `git commit` steps in the plan. They should leave changes staged or unstaged in the working tree. After ALL tasks in the plan complete, I (the main agent) bundle changes into feature-level commits and ask the user to approve each bundle before running `git commit`. This avoids parallel-commit races and keeps history grouped by logical feature rather than per-task noise.

**Why:** User explicitly requested: "use opus for all subagent for better reasoning. once all the chanegs are done at last do the commits per feature at the end to avoid parallel commits" plus "go to next tasks only when current completes" and "add tests, bdds, tdds".

**How to apply:**
- Every `Agent` tool call that dispatches a plan task: pass `model: "opus"`, include explicit instructions "DO NOT RUN THE COMMIT STEP — leave changes uncommitted", "add BDD-style tests for user-facing behavior in addition to the plan's TDD".
- Never run `run_in_background: true` for plan-task subagents — we need their output before deciding on the next task.
- Between tasks, summarize in <300 words and wait for explicit "proceed" / "continue".
- After the last task, propose a feature-commit grouping (e.g., "Phase A → one commit, Phase B API scaffold → one commit, each Phase D feature route → its own commit") and get approval before committing.
- If a subagent fails or produces partial work, stop and surface the issue — do not dispatch the next one.
