---
name: resume-rewrite-checks-rule
description: "Every résumé rewrite must be scored with all three checkers (local scoring, ResumeNext, resume-ats-optimizer) against the exact JD, master vs tailored"
metadata:
  node_type: memory
  type: feedback
  originSessionId: db689d72-4e6d-4357-8452-a68d1115b7ba
  modified: 2026-11-02T06:26:47.184Z
---

When rewriting or tailoring a résumé, load the `resume-ats-optimizer` skill and run ResumeNext `match_resume_to_job` plus the local `resume-scoring` service (127.0.0.1:3212) on the master and the tailored PDF text against the exact saved JD. Recorded as a rule in the project AGENTS.md ("Résumé rewrite rule").

**Why:** on 2026-11-02 the user caught that eight versions were tailored with only the local keyword scorer, skipping the skill and ResumeNext the project prescribes, and asked for a rule ("this is something important"). They also want the résumé page to show which JD a version matches (with a link), what matches, and each tool's score.

**How to apply:**
- Scripts from that session: `resume-build/checks.py` and `resumenext.py` (MCP over HTTP at 127.0.0.1:8004/mcp) in the session scratchpad.
- Strip `SOURCE:`/`POSTED:` lines from JD snapshots before sending them to ResumeNext.
- ResumeNext's keyword list is noisy (generic nouns, URLs, req ids): show it, don't chase it.
- Its experience-entry count is inflated by wrapped bullets, so don't reshape bullets for that.
- Its summary-length flag (<600 chars) is worth fixing.
- Present-tense verbs for the current role were the user's 3 Oct choice: ask before changing.
- No unsupported additions ([[resume-no-personal-projects]], [[record-resume-at-submit]]).
