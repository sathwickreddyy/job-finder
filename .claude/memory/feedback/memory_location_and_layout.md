---
name: Memory lives in project .claude with typed subdirectories
description: For this project, write all memories under .claude/memory/{feedback,user,project,reference}/ at the repo root, not into the user-scope harness dir
type: feedback
---

For the `job-finder` project, memory files live at **`.claude/memory/`** under the project root, organized into typed subdirectories:

```
.claude/memory/
  MEMORY.md                    # index (flat list, one line per memory)
  feedback/                    # behavioral preferences (this directory)
  user/                        # who the user is / how they work
  project/                     # current state of ongoing work
  reference/                   # pointers to external systems
```

The user-scope path `~/.claude/projects/-Users-sathwick-…/memory/` is a **symlink** to `.claude/memory/` in the repo, so the harness's auto-load mechanism still works from a single source of truth.

**Why:** User asked "always update memories in project scope on behaviors in .claude folder at project root in an organised structure." They want memory to be versioned alongside the code, visible in PRs, and grouped by type instead of a flat `feedback_*.md` bag.

**How to apply:**
- When writing a new memory, place the file at `.claude/memory/<type>/<slug>.md` (e.g., `.claude/memory/feedback/prefer_docker_compose.md`), not at the harness-default flat path.
- Keep the `type:` frontmatter field matching the subdirectory.
- Update `.claude/memory/MEMORY.md` with a one-line link using the path relative to `MEMORY.md` (e.g., `- [title](feedback/prefer_docker_compose.md) — hook`).
- Never write memory content directly into `MEMORY.md`; it's an index only.
- If the user-scope symlink breaks (e.g., repo moved), recreate it: `ln -sfn /absolute/path/to/repo/.claude/memory ~/.claude/projects/-<slug>/memory`.
- This layout means memories are committed to git. Do not put secrets or anything truly private in here.
