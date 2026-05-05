---
name: Incremental commits and latest Python
description: In this project, commit progress in small logical units as work proceeds, and use the newest installed Python for .venv
type: feedback
---

Commit incrementally — one logical unit per commit as work proceeds (infra, core, storage, sources, scoring, UI, tests, docs), not a single mega-commit at the end.

Use the newest Python available on the machine when creating `.venv` (check `python3.13`, `python3.12`, `python3.11` in order).

**Why:** User interrupted mid-scaffold to require both — smaller commits give rollback points and a readable history, and latest Python avoids future upgrade churn.

**How to apply:** After each major file group (scaffold, models/utils/config/dedupe, config_repo, storage, sources, scoring, resume/integrations/reports, UI/CLI, YAML seeds, tests/workflow, README), run `git add` + `git commit` with a conventional-commit message before moving on. When bootstrapping `.venv`, prefer `python3.13 -m venv .venv` (fall back to 3.12 then 3.11).
