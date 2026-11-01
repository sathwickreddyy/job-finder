---
name: backlog-job-apply-skill
description: "Backlog for 2026-11-02 — build a reusable \"apply to jobs\" skill capturing the workflow and rules learned on 2026-11-01"
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
- Résumé: tailor per opening from the editable DOCX master (truthful re-weighting only), upload to JobOps as a revision with change notes, apply with that exact version.
- Applying: user handles account creation, logins, captchas, legal/personal questions and Submit; the built-in browser pane cannot attach files, Claude in Chrome (`file_upload`) can when connected.
- Recording: `POST /api/v1/applications` with `humanConfirmed: true`, `postedAt`/`postedAtKind`, and `resumeVersionId` ([[record-resume-at-submit]]); save openings as ROLE facts in the Companies portal.

**How to apply:** draft the skill (e.g. in the project's `.claude/skills/`) from these rules; confirm placement and contents with the user before finalizing.
