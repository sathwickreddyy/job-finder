# Daily Naukri maintenance

Independent maintenance mode: do not ask for an opening or start applications/discovery. The user approved **09:00 Asia/Kolkata daily**, with **18:00 retry only if today's update has not succeeded**. Any genuine minor/major update is acceptable; one verified update satisfies the day.

## Run in order

1. Read ignored `jobops/data/job-apply/naukri.json` if present. Use India's calendar date regardless of host timezone. Inspect any in-progress attempt before competing for a browser; user activity takes priority.
2. If `lastSuccess.indiaDate` is today with verification evidence, reconcile the JobOps indicator below and exit without another profile edit. Otherwise inspect the user's Naukri profile through permitted browser/computer control. Discover actual controls; do not guess selectors or undocumented APIs.
3. Confirm the intended account. An update visibly already made today can satisfy the requirement: record `observed_already_updated` with UI evidence, not a claim this agent edited it.
4. Prefer an actual profile refresh/update control if available. Otherwise save a truthful supported minor/major update. Re-uploading the same **approved general-purpose PDF** is an alternative when no content change is needed. Resolve its identity from the profile/current Naukri file or an explicit prior choice; ask once if ambiguous and retain the approved identity privately. Never upload the unformatted master or automatically pick a new role-specific résumé.
5. Confirm major new factual content before publishing it. Do not invent changed employment, skills, compensation or availability for activity. A same-content save/upload counts only if actually accepted; never claim an unobserved ranking benefit.
6. Verify success feedback and persisted profile/file/update date where available. No verifiable save → unverified, not success. Do not invent a site timestamp that is not shown.
7. Record success only after verification. Login/CAPTCHA/refusal, unsupported attachment or ambiguous file → record the block and required user action, leave pending and stop. The evening run retries after checking state. A failed evening attempt stays pending for user/next normal run; no endless retry schedule.

## JobOps indicator

The Naukri card on Home shows an indicator (status chip plus fourteen-day strip) fed only by verified updates. After recording a verified success in the private receipt, also record it in JobOps so the card stays current:

```
POST http://localhost:3210/api/v1/naukri
{"action": "<same action as the receipt>", "evidence": "<what Naukri displayed>", "verified": true}
```

`indiaDate` defaults to today in India; pass it only to backfill a day you actually verified. A day already recorded is kept as it was, and a future date is refused. Never post for a blocked or unverified run. `GET /api/v1/naukri` returns the indicator status. If the private receipt already confirms today but JobOps has no update for today, retry the record using the receipt’s date, action and evidence. A JobOps failure does not invalidate a verified Naukri update.

## Private receipt

Use `jobops/data/job-apply/naukri.json`, shared between assistants, ignored by Git. Create as needed with `schemaVersion: 1`, `timezone: "Asia/Kolkata"`, an `attempts` list, optional verified account/general-résumé identity and optional `lastSuccess`.

Each attempt retains started/finished timestamps, `indiaDate`, actual action, status (`succeeded`, `blocked`, `unverified`) and observed evidence or block reason. `lastSuccess` retains only a verified successful India date/time/action/evidence. A blocked run must not advance it or erase past success. An already-updated observation is labelled as an observation.

Write atomically while preserving valid previous attempts/latest shared state. Keep credentials/session tokens out. If file access is missing, verify profile date directly and report that shared deduplication is unavailable. If browser access is missing, give the exact manual action and wait for evidence. A scheduled invocation is never itself evidence of a profile update.

## Scheduling

Keep one schedule across Codex/Claude for this account. Inspect existing schedules before creation. Codex uses its native automation tool: a heartbeat in this chat at 09:00 and 18:00 in the user's India timezone, directing each run here and to the private receipt. Keep the existing application/discovery automation separate. Other assistants use their native scheduler; do not hand-edit internal scheduler databases or invent an MCP cron route.

Notify meaningful completion/failure/required action; exit quietly when today's success is already recorded in both places. Local execution needs the computer/browser available. A skill alone cannot guarantee execution or top recruiter-search placement.
