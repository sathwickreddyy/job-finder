---
name: resume-revisions-by-agent
description: "Résumé uploads and revisions are done by Claude Code/Codex through the JobOps API, not by the user or a chat AI"
metadata:
  node_type: memory
  type: user
  originSessionId: 97dfc13a-57b1-4ab1-ab44-a4e2a1df8c3c
  modified: 2026-11-02T13:43:24.961Z
---

The user never uploads or revises résumés by hand or in a ChatGPT/Claude chat. They connect Claude Code or Codex to JobOps and ask it to revise; the agent uploads the new version and records scores. Questions about gaps (have I done X?) belong in that agent chat, never as buttons or forms in the portal — the user won't sit and click through decisions, and such UI wastes panel space.

**Why:** stated 2026-11-02 while redesigning the résumé score panel.
**How to apply:** design résumé features so the agent can read what it needs from the API when it opens a résumé (brief, gaps, issues, rules); the panel shows the user a compact view of that, not an input workflow. Compare "current" vs "revised" résumé — don't call the base version "master" in UI copy. Related: [[resume-rewrite-checks-rule]].
