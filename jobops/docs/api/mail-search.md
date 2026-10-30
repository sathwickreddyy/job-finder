# Explicit mailbox search API

`GET /api/v1/mail/search` returns the input JSON schema and examples.
`POST /api/v1/mail/search` performs one page of read-only provider search per
selected account, concurrently. Use the same endpoint from company, application,
and mail pages. The existing UI is not switched to this endpoint yet.

## Last N days across all accounts

```json
{ "lastDays": 7 }
```

N is a positive integer (up to 3650). A day means 24 elapsed hours: 3 means the
last 72 hours, not three Asia/Kolkata calendar dates. The first response resolves
and returns explicit UTC timestamps. All continuations retain that exact window.
Omitting accounts selects all connected Gmail and Outlook accounts (at most 10).
This date-only flow fetches all incoming messages; classification does not filter
them. Unknown wording and recruiter reach-outs remain available for review.

## Company keywords or sender/subject patterns

```json
{
  "accounts": ["your-address@example.com"],
  "keywords": ["Amazon", "Amazon Jobs"],
  "subjects": ["interview", "application"],
  "lastDays": 90
}
```

```json
{
  "senders": ["recruiter@example.com"],
  "since": "2026-10-01T00:00:00+05:30",
  "until": "2026-10-31T00:00:00+05:30"
}
```

Within each array alternatives are ORed; populated fields are ANDed. Keywords
use the provider's general search (Outlook from/subject/body); subjects target the
subject field, senders use the provider's from-address search. Terms are literal
phrases with provider search/tokenization semantics, not regular expressions,
raw operators, or an identical substring matcher across providers. Quotes,
backslashes and control characters are rejected. Dates must include timezone.
`since` and `lastDays` are mutually exclusive. Without either lower bound, search
covers all available history before until (default: request time).

No company rules, saved application state, monitoring baseline or classifier
relevance flag silently restrict this search. Callers provide visible criteria;
a company/application page can reuse this endpoint with its chosen criteria.

## Pagination and transparency

The response contains the resolved query, `[since, until)` date window, folder
scope, `complete`, `more`, `limited`, and one entry per account:

- `effectiveQuery`: actual provider search expression, or date-only filter summary.
- `fetched`, `returned`, `skippedContext`, `skippedOutsideWindow`: this page's counts.
- `totalFetched`: cumulative fetched count for that account in this search.
- `messages`: parsed plain-text mail, account/provider/folder identities and advisory
  deterministic classification. No result is discarded for unknown wording.
- `complete`, `limited`, `error`: account coverage and failure status.

If `nextCursor` is non-null, POST only:

```json
{ "cursor": "<nextCursor>" }
```

Continue until `complete: true`. Each call advances one page per unfinished
account (Gmail 25, Outlook 50). Accounts already completed are not fetched again.
An account error leaves its page resumable; other account results still return.
Partial failures use HTTP 200 with explicit account errors and complete=false.
A failed page can be retried by using the returned cursor. Preserve/accumulate
results across responses and deduplicate by `identity`. Replaying an older cursor
may repeat that page. Cursors are encrypted/authenticated, expire after 24 hours,
and are bound to the original query/window and selected connection identities.
Never log cursor contents or message bodies.

Gmail includes spam/trash. Outlook uses the mailbox-wide endpoint with inventory
of hidden/nested folders. Sent, drafts and outbox results are context only and
excluded. Online archive mailboxes and permanently deleted messages are outside
coverage. Gmail MIME/HTML and Outlook HTML are converted to inert plain text;
bodies are limited to 100,000 characters. Search indexes can lag new arrivals.

Outlook keyword searches use Graph `$search`, which has a 1,000-result ceiling.
At that ceiling, `limited=true`, `complete=false`; narrow the date range and search
again. Date-only searches use Graph `$filter` pagination and do not have that
search ceiling. KQL date bounds are widened to whole days to protect timezone
edges; exact timestamp bounds are enforced before returning results. Some fetched
messages may therefore be outside the requested window, with explicit counts.
The ceiling count includes these messages and context messages conservatively.

## Persistence and daily use

This API is the search layer. It does not save messages, mark them seen, create
application events or change the existing queue. It only renews OAuth credentials
when needed. Running a last-N-days search daily is supported, including overlapping
windows, but repeat searches return matching messages again. Existing tracked-mail
persistence can be integrated as a separate explicit capture step; do not claim
this search alone captures messages or marks them new/seen.

The endpoint inherits the app's host, origin and access-cookie protections. Browser
POST requests must be same-origin; a CLI caller needs an allowed Origin and, when
configured, the normal unlocked session cookie. Do not make it a public unauthenticated
mail-reading endpoint. Responses use private/no-store. No new OAuth scopes are required.

Provider references:

- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
- https://learn.microsoft.com/en-us/graph/search-query-parameter#use-search-on-message-collections
