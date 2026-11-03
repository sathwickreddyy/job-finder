# Mail refresh and query verification

Refresh all connected inboxes before applying and after recording submission; this also captures other applications' responses. Use APIs or the Mail workspace. Mailbox access is read-only; no replies are implicitly authorized. Respect manual tags/links/outcomes/dismissals.

## Fetch and urgency

`POST /api/v1/mail/check` with `{}` uses saved checkpoints. Continue `{}` while `more: true`, retaining per-inbox counts/results/errors. Successful accounts keep progress when one fails. Auth failures are pending user actions, not a successful complete check. Allow one bounded retry for transient errors respecting provider delay; persistent errors end that account's attempt, not a tight loop.

Use `{ "lastDays": 30 }` only for a justified broader window (1–180), on the first call only; subsequent calls use `{}`. Do not restart each page. If work must pause, retain checkpoint/next action.

Read `GET /api/v1/mail?attention=open`, following its cursor. Inspect actions/deadlines, not only tags. Urgent interview/assessment invitations, time-sensitive recruiter requests or offer deadlines pause the application: save the step and mail id, show message/action/known deadline, wait until noticed, then resume. Save acknowledgement separately from OPEN/DONE attention. Do not mark mail handled or re-alert for the same acknowledged message just to continue.

## Company search

Resolve the URL-encoded lower-case mail company key through the company's UI/context. It may contain spaces; do not substitute a UUID or assume the hyphenated page slug is its key.

1. `GET /api/v1/mail/company/{key}/search` returns rule, inboxes, generated `queries`, last run, `ruleHits` and dropped mail. Read before editing.
2. Add observed/verified company aliases, company domains, recruiter addresses and distinctive hiring-team phrases. Unknown ATS sender addresses stay unknown until observed.
3. Merge and preserve existing `aliases`, `domains`, `senders`, `keywords`, `excludedTerms`: `PUT /api/v1/mail/company/{key}/rule` **replaces the full rule**. Read it back.
4. Inspect Gmail/Outlook queries: intended identities should be literal alternatives. Do not require every message to contain a requisition/title, since brief replies can omit them.
5. `POST /api/v1/mail/company/{key}/search` with `{}` uses the normal next window. For a bounded recovery use `lastDays` (1–3650), optional selected `accounts`, and `restart: true` only initially. Continue `{}` while `more`; inspect each lane's actual query/results/errors and folder coverage.
6. Compare known relevant mail with kept/dropped results and reasons. Use `GET /api/v1/mail/dropped?since=ISO&company=KEY` if needed. A message with no company match can be absent from this filtered list: inspect the bounded unfiltered `GET /api/v1/mail/dropped?since=ISO` ledger too, using observed sender/subject/time to locate the known message. If it was never fetched, report that retrieval gap rather than claiming it was dropped. Zero matches alone does not validate coverage. Report when there is no known message to test against.
7. Include one verified legitimate dropped message with `POST /api/v1/mail/{trackingId}/include`, `{ "company": "KEY" }`. Read shared-sender handling/suggested keyword, verify company/application, then improve the rule from observed evidence. Do not bulk-include dropped mail.

## Actual matching semantics

- Names/aliases are searched in subject/sender. Provider keywords can retrieve body text, but the sorter accepts a keyword only in **subject or sender display name**; body-only messages may be dropped.
- Distinctive observed phrases such as `Acme Hiring Team` identify a company; generic `interview`, `application`, `hiring team` or vendor names do not and are refused.
- Bare shared ATS/Gmail/LinkedIn domains do not identify a company. Even an exact ATS address can serve many companies: inspect ambiguity and company wording before adding it.
- Queries OR identities with date bounds. Exclusion phrases are applied by the sorter rather than provider query; their absence from query text is expected. Read drop reasons before changing exclusions.
- LinkedIn connection/referral requests sent to the user, digests/promotions remain excluded. Saved contacts do not prove outbound outreach. LinkedIn replies need actual contacted-person/thread evidence; keywords cannot manufacture it.
- Historical recovered mail is not a new current outcome. Let JobOps handle supported clear outcomes; do not force ambiguous links or override user decisions.

Record the real submission before the final refresh so mail sync has its context. No acknowledgement yet means pending, not failed submission. Never retry Submit because mail is absent. Full response/window examples: `jobops/docs/api/mail-search.md`; implementation under `jobops/src/features/mail/` and `services/mail/providers/search-query.ts`.
