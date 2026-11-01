---
name: gmail-units-per-minute-limit
description: "JobOps' Google Cloud project hits Gmail \"Units per minute per user\" at ~600-800 units/min, far below the published 15,000"
metadata:
  node_type: memory
  type: project
  originSessionId: c8c8eeb1-23b0-43b5-a78b-f2947113c9dc
  modified: 2026-11-01T08:04:31.533Z
---

Observed 2026-11-01 from the fetch dialog's request log: Gmail returns 403 `rateLimitExceeded` with Google's limit name "Units per minute per user" once a fetch reaches roughly 600-800 quota units in a minute (about 120-160 `messages.get` calls). Google's documented default is 15,000 units per user per minute, so this project's quota is set lower in Cloud Console (APIs & Services → Gmail API → Quotas), or the default differs for it.

**Why:** It explains the repeated "Gmail rate limit reached" errors; the cause was the project quota, not request concurrency or bandwidth.

**How to apply:** Before tuning Gmail fetch pacing further, ask the user what Cloud Console shows for "Units per minute per user". The app now paces adaptively (usage.ts: 250 ms doubling up to 2 s, persisted per inbox) and pauses an inbox for 2 minutes after three failed retries. Re-reading already-decided mail is the main quota cost. See [[fetch-dialog-request-log]].
