# Fetch, company search and Include this API

Local agent routes, trusted on the local network like `/api/v1/companies`. Mailbox access is
read-only. Every route answers JSON with `cache-control: private, no-store`; errors are
`{ "error": "<sentence>" }` with a 4xx status, or `"Invalid request."` with `issues` for a
malformed body.

The same services back the Mail page (Fetch new mail), the company page ("How we find
<Company>'s mail") and these routes, so a run started here shows up there.

## Fetch new mail

`POST /api/v1/mail/check` reads one page per connected inbox and returns where each inbox
stands. Call it again while `more` is `true`.

```json
{ "lastDays": 30 }
```

- No body, or `{}`: fetch from each inbox's last fetch (minus a one-hour overlap) to now.
- `lastDays` (1–180) starts a new window that reaches back that many 24-hour days, or to the
  last fetch when that is earlier, so no gap opens. Send it on the first call only; continue
  with calls that leave it out. Above 180 the answer is `400` with
  "Fetch goes back up to 180 days. For older mail, search a company from its page."

```json
{
  "more": false,
  "newAttention": 1,
  "accounts": [
    {
      "account": "me@gmail.com",
      "provider": "GMAIL",
      "status": "done",
      "error": null,
      "lastFetchedAt": "2026-10-31T05:00:00.000Z",
      "since": "2026-10-01T05:00:00.000Z",
      "counts": { "fetched": 25, "alreadyHere": 20, "kept": 2, "dropped": 3, "newAttention": 1 }
    }
  ]
}
```

`counts` covers this call's page. Mail older than the normal window (last fetch minus the
overlap) is recovered history: it is stored and shown, already handled, and never counts
toward `newAttention`.

## What was dropped

`GET /api/v1/mail/dropped?since=<ISO time>&company=<key>` lists dropped mail decided since
`since` (a fetch or search start), newest first, at most 200. `company` narrows it to one
company key.

```json
{
  "items": [
    {
      "trackingId": "6f1c3c2a-6a8a-4a57-9d1e-2b0a3f7c8d90",
      "messageId": null,
      "receivedAt": "2026-10-28T09:12:00.000Z",
      "sender": "events@example.net",
      "senderName": "Events",
      "subject": "Oracle meetup this Friday",
      "folders": ["Inbox"],
      "kept": false,
      "tag": null,
      "reason": "Matched Oracle by company name in subject; no job event recognised",
      "companyKeys": ["oracle"],
      "evidence": ["Company name in subject"]
    }
  ]
}
```

## Company search

`GET /api/v1/mail/company/{key}/search` returns the company's rule, the connected inboxes,
the last run, what each kind of rule found last time (`ruleHits`), the exact query each inbox
would receive for the next search, and the last run's dropped mail. `{key}` is the lower-case
company name, URL-encoded (`level%20ai`).

```json
{
  "rule": {
    "company": "Oracle",
    "aliases": [],
    "domains": ["oracle.com"],
    "senders": ["oracle-hcm@oracle.com"],
    "keywords": ["Oracle Talent Acquisition"],
    "excludedTerms": ["Oracle newsletter"]
  },
  "ruleSource": "Your saved pattern",
  "inboxes": [{ "account": "me@gmail.com", "provider": "GMAIL" }],
  "lastRun": null,
  "ruleHits": null,
  "queries": {
    "me@gmail.com": "-in:sent -in:drafts after:1785666599 before:1793442600 {from:\"oracle-hcm@oracle.com\" from:\"oracle.com\" subject:\"Oracle\" from:\"Oracle\" \"Oracle Talent Acquisition\"}"
  },
  "dropped": []
}
```

`POST /api/v1/mail/company/{key}/search` runs one page per selected inbox and returns each
inbox's lane. Call it again with `{}` (or no body) while `more` is `true`.

```json
{ "lastDays": 365, "accounts": ["me@gmail.com"], "restart": true }
```

- `lastDays` is 1–3650; without it a new search starts at the last search's end, or 90 days
  back for a company never searched. `accounts` picks inboxes (all by default). Any of
  `lastDays`, `accounts` or `restart` starts a new run; none continues the unfinished one.
- Gmail receives `q` with second-precision bounds; Outlook receives `$search` KQL with a day
  widened on each side, and both keep only mail inside the exact window. Spam, Junk and
  Trash are searched; sent mail and drafts are left out. Never include phrases are applied
  by the sorter, so what they leave out is listed with its reason.
- One inbox failing (an expired sign-in, say) is reported on its own lane; the others carry
  on. A repeated search over the same window finds everything `alreadyHere`.

```json
{
  "more": false,
  "run": {
    "key": "oracle",
    "since": "2025-10-31T05:00:00.000Z",
    "until": "2026-10-31T05:00:00.000Z",
    "accounts": ["me@gmail.com"],
    "startedAt": "2026-10-31T05:00:00.000Z",
    "finishedAt": "2026-10-31T05:00:04.000Z",
    "counts": { "fetched": 12, "alreadyHere": 4, "kept": 5, "dropped": 3, "newAttention": 0 },
    "ruleHits": { "addresses": 3, "domains": 2, "keywords": 1, "never": 1 }
  },
  "lanes": [
    {
      "account": "me@gmail.com",
      "provider": "GMAIL",
      "state": "done",
      "query": "-in:sent -in:drafts …",
      "counts": { "fetched": 12, "alreadyHere": 4, "kept": 5, "dropped": 3, "newAttention": 0 },
      "items": [],
      "error": null
    }
  ]
}
```

`items` holds the page's new or re-decided emails (kept with their `tag`, dropped with their
`reason`), in the shape `GET /api/v1/mail/dropped` uses.

## Company rule

`PUT /api/v1/mail/company/{key}/rule` replaces the rule and places kept mail that matched no
company yet but matches the new rule. It never hides kept mail or changes attention.

```json
{
  "aliases": [],
  "domains": ["oracle.com"],
  "senders": ["oracle-hcm@oracle.com"],
  "keywords": ["Oracle Talent Acquisition"],
  "excludedTerms": []
}
```

Keywords match the subject or the sender's name, never the body. A keyword made only of a
word every company's mail uses ("Interview", "jobs", "recruiter" and similar, in any case) is
refused with `400`:
`"Interview" appears in every company's mail, so it can't identify Oracle. Try a phrase like "Oracle Talent".`
An older rule's `subjectTerms` are read as keywords.

Answer: `{ "rule": { … }, "placed": 2 }`.

## Include this

`POST /api/v1/mail/{trackingId}/include` with `{ "company": "oracle" }` keeps a dropped email
for that company: it reads the email again from its inbox, stores it (tagged by the sorter,
Other when no job event is recognised) and marks its ledger row kept. The sender is added to
the company's addresses unless many companies share it (personal mail, applicant tracking
systems, job portals, background-check vendors); then the sender's name is offered as a
keyword instead.

```json
{
  "item": { "id": "…", "subject": "Thank you for your application", "tag": "application" },
  "addedSender": null,
  "skippedShared": "no-reply@ashbyhq.com",
  "suggestedKeyword": "Level AI Hiring Team"
}
```

`409` when the email is already kept or its inbox is disconnected; `404` when the inbox no
longer has it or the company is unknown.
