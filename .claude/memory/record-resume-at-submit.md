---
name: record-resume-at-submit
description: Confirm the résumé version before recording an application — JobOps locks it once the record is sent
metadata:
  node_type: memory
  type: feedback
  originSessionId: db689d72-4e6d-4357-8452-a68d1115b7ba
  modified: 2026-11-01T17:14:46.928Z
---

Before calling `POST /api/v1/applications`, ask the user which résumé file they attached and pass `application.resumeVersionId`. Once a record is sent, JobOps refuses any résumé change (even from empty), so a missed version can only be added as a history note.

**Why:** on 2026-11-01 the Okta application was recorded without it; the user then confirmed the 3 Oct backend & data platforms version and it could only go in as a note. On 2026-11-03 the user approved linking it directly in the database (empty field only, with an activity-log entry); do that only with the user's explicit yes.

**How to apply:** make "which résumé did you attach?" part of the submit confirmation for every application. Related: [[pay-preference-32-lpa]].
