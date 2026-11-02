---
name: backlog-job-apply-skill
description: "job-apply skill at .claude/skills/job-apply/SKILL.md (committed 2026-11-03) from the user's five-step workflow"
metadata:
  node_type: memory
  type: project
  originSessionId: db689d72-4e6d-4357-8452-a68d1115b7ba
  modified: 2026-11-01T17:41:30.041Z
---

User asked (2026-11-01) to build a skill for applying to jobs "by keeping all instructions handy", as backlog for **2026-11-02**. Raise it at the start of the next session.

Rules the skill should encode (all learned/confirmed 2026-11-01):
- Scope: Bengaluru/Hyderabad only; companies with sourced pay > ₹32 LPA ([[pay-preference-32-lpa]]); exclude QA/SDET/front-end/mobile/Staff+/managers.
- Discovery: read official ATS feeds (Greenhouse `first_published`, Lever, Ashby, Workday cxs, amazon.jobs search.json, Oracle HCM REST, Eightfold) for companies in the JobOps Companies portal; LinkedIn dates were refreshes in 13 of 18 checked openings, so never trust them for the 14-day freshness window.
- Gates before prep: official posting date ≥ today−13 (Asia/Kolkata), min years ≤ ~6 (candidate ~5.3 yrs), not already applied (`GET /api/v1/applications?company=`).
- Prep in parallel subagents: JD essentials, apply URL + account/captcha needs, fit with quoted résumé evidence, honest draft answers, verdict.
- Résumé: tailor per opening from the editable DOCX master (truthful re-weighting only) as local files in `jobops/data/resume-exports/tailored/`. Superseded 2026-11-03: upload to JobOps only after the user confirms submission and names the attached file.
- Applying: user handles account creation, logins, captchas, legal/personal questions and Submit; the built-in browser pane cannot attach files, Claude in Chrome (`file_upload`) can when connected.
- Recording: `POST /api/v1/applications` with `humanConfirmed: true`, `postedAt`/`postedAtKind`, and `resumeVersionId` ([[record-resume-at-submit]]); save openings as ROLE facts in the Companies portal.

**Status (2026-11-03):** the user pasted a five-step apply workflow (live check → local tailoring → three-tool scores → user-approved form → upload and record after submit) and chose to make it the skill. Skill is at `.claude/skills/job-apply/SKILL.md`, refined from the first run (Target R0000387032, applied 2026-11-03) and committed to main as 2d676fc.

**How to apply:** use the skill for every application; apply the user's review edits to it rather than to this note.
