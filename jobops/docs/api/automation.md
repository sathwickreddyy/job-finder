# JobOps API automation guide

Use this guide when reading or updating JobOps from Codex, Claude Code, Antigravity, or another
agent. Start here, then open the linked contract for the task. Repository policy and the user's
authorization govern which actions you may take. Route handlers and their validators define the
accepted payloads.

## Connect and verify

1. Use a terminal that can reach the running Docker app. On the JobOps machine, set
   `JOBOPS_URL=http://127.0.0.1:3210`. From another machine, use the user's approved private
   address or configured hostname. A cloud agent needs approved access to that private network.
2. Check access with a read. The supported local agent routes use the existing trusted LAN rules.
   Ordinary terminal requests on that network use no access cookie, ingestion token, or `Origin`
   header. Routes marked **protected** use the normal JobOps session when browser unlock is
   enabled. Protected mutations also require the actual JobOps origin.

   ```sh
   JOBOPS_URL='http://127.0.0.1:3210'
   curl --fail-with-body --silent --show-error "$JOBOPS_URL/api/v1/companies/schema"
   ```

3. Resolve the real record before writing. Match the official opening URL and requisition, the
   application method, the exact message, or the résumé version or revision as appropriate. Use
   JSON with `Content-Type: application/json` and multipart form data for uploads. Read the HTTP
   status and response, then verify the saved result. Keep private files and checkpoints under
   ignored `jobops/data/` and report only the details the user needs.
4. On `400`, correct the payload. On `401` or `403`, check the URL, route access rules, and session.
   On `404`, verify the identifier and deployed version. On `409`, reread the record or use the
   returned canonical identifier before deciding what to do. After an ambiguous write failure,
   read back the current state before retrying. Respect `Retry-After` when provided. For an
   application transition, reuse the same `requestId` and body for the same action.

Use the documented HTTP routes for automation. If one is unavailable, use the permitted product
workflow or report the exact missing step. Follow the existing network, origin, authentication,
and user permission boundaries. Keep credentials and personal artifacts out of Git.

## What the API can automate

### Companies and sourced research

| Method and path | Use |
| --- | --- |
| `GET /api/v1/companies/schema` | Read the company ingestion OpenAPI contract before writing. |
| `GET /api/v1/companies` | Find companies by query, city, or status. Use `status=ALL` when checking for an existing archived company. |
| `GET /api/v1/companies/{idOrSlug}` | Read one company, its locations, facts and observation history. |
| `POST /api/v1/companies` | Upsert a verified company and sourced facts. Reuse the canonical slug and stable fact keys. |
| `PATCH /api/v1/companies/{idOrSlug}` | Update an existing company or add sourced facts. Preserve unrelated data. |
| `POST /api/v1/companies/batch` | Write up to 100 companies in one transaction. |

Research outside JobOps, preserve source URLs and date provenance, and apply the company
shortlist rules in [`AGENTS.md`](../../../AGENTS.md). Use the [company ingestion examples](../../README.md#company-research-api--for-browser-agents-and-curl)
for field formats. Get user authorization before archiving or restoring companies.

### Applications and outreach

| Method and path | Use |
| --- | --- |
| `GET /api/v1/applications` | Look up records with exactly one of `?url=` or `?company=`. Check whether the specific opening was submitted. |
| `POST /api/v1/applications` | Record a confirmed application or sent outreach with `humanConfirmed: true`. Supply the exact used PDF version when a PDF was sent. The request can save its opening alongside the record. |
| `GET /api/v1/applications/{id}/transitions` | Read current state, available actions and outcome requirements. |
| `POST /api/v1/applications/{id}/transitions` | Record `recordSent`, `notApplying`, `reopen` or `recordOutcome` when the state allows it. Covers replies, follow-ups, assessments, rounds, referrals, offers, rejections and closure. |

`humanConfirmed: true` represents an action that actually happened and was confirmed. It does
not grant permission to perform it. Save the sourced posting date and its kind separately from
discovery and submission dates. Follow the current India-date freshness policy before preparing
or applying. Use the [record payload example](../../../.claude/skills/job-apply/references/jobops-api.md#record-actual-submission-or-outreach)
and [transition contract](application-transitions.md). When an email supplies the evidence, use
the mail action to keep the email and outcome linked.

### Recruiting mail

| Method and path | Use |
| --- | --- |
| `POST /api/v1/mail/check` | Refresh connected inboxes. Continue while `more: true` and report failures per account. |
| `GET /api/v1/mail` | List kept mail with company, application, search, tag or attention filters. Follow `nextCursor` as needed. |
| `GET /api/v1/mail/{id}` | Read a specific message and its handling state. |
| `PATCH /api/v1/mail/{id}` | Retag, place or reopen mail using the supported fields. Retagging or placement can trigger existing application sync rules. |
| `POST /api/v1/mail/{id}/handle` | Use `link`, `unlink`, `justInfo`, `dismiss`, `reopen`, `recordOutcome`, or `undoAutoOutcome`. Verify the exact application before linking or recording an outcome. |
| `GET /api/v1/mail/company/{key}/search` | Inspect company rules, inboxes, queries and prior results. |
| `POST /api/v1/mail/company/{key}/search` | Search the selected connected inboxes for that company. Continue while `more: true`. |
| `PUT /api/v1/mail/company/{key}/rule` | Replace the full company rule. Read and merge existing fields before sending. |
| `GET /api/v1/mail/dropped` | Inspect why messages were filtered using `since` and optional `company`. |
| `POST /api/v1/mail/{id}/include` | Restore a verified recruiting message using its dropped ledger `trackingId` and the company key. |

Mail refresh can record application changes under existing JobOps rules. Check the updated
state before adding a manual outcome. Keep ambiguous or urgent mail visible until its next
action is clear. Mailbox access is read-only. Initial connection and reauthorization use the
user's Google or Microsoft sign-in and consent. See the [mail contract](mail-search.md).

### Résumés, descriptions and scoring

| Method and path | Use |
| --- | --- |
| `GET /api/v1/resumes` | List application PDF versions and editable master anchors with current revision metadata. |
| `POST /api/v1/resumes` | Upload an existing PDF with multipart `file`, family `resumeId` and `versionLabel`. Optional `changeNotes` and `docxPath` carry lineage. Verify the returned SHA-256 before recording a submission. |
| `GET /api/v1/resumes/{masterId}/master` | Read the editable source and revision ledger. |
| `GET /api/v1/resumes/{masterId}/master/file` | Download the source pinned with `?revision={revisionId}`. Add `format=pdf` for that revision's supplied export. |
| `POST /api/v1/resumes/{masterId}/master` | Append an authorized DOCX revision using multipart `file`, `reason` and `expectedRevisionId`. On a stale revision conflict, reload and reconcile. |
| `GET /api/v1/resumes/{versionId}/openings` | Find saved openings the selected PDF can be scored against. |
| `GET /api/v1/resumes/{versionId}/fit` | Read the exact saved job description, tool results and revision brief. |
| `POST /api/v1/resumes/{versionId}/fit` | Record the saved job target and evidence from completed checks. |
| `POST /api/v1/resumes/{versionId}/score` | Run one tool against a saved `snapshotId` and store its result. |
| `GET /api/v1/jobs/snapshots/{snapshotId}/terms` | Read the exact saved description and reviewed terms. |
| `POST /api/v1/jobs/snapshots/{snapshotId}/terms/suggest` | Suggest terms from the saved description with supporting lines. |
| `PUT /api/v1/jobs/snapshots/{snapshotId}/terms` | Save the reviewed terms for the selected snapshot. |
| `POST /api/v1/score-text/terms` | Suggest terms for pasted job text without saving it in JobOps. |
| `POST /api/v1/resumes/{versionId}/score-text` | Run a check against pasted job text without saving the result in JobOps. |
| `GET /api/resumes/{versionId}/file?download=1` | **Protected.** Download the exact stored application PDF. |
| `PATCH /api/v1/resumes/{versionId}` | **Protected.** Set or clear `docxPath` with a same-origin request. |

Choose the master revision and exact PDF version deliberately. Preserve submitted files and
compare versions against the same saved description and reviewed requirements. Tool IDs are
`jobops-lexical`, `resume-ats-optimizer`, and `resumenext`. ResumeNext sends résumé text and the
job description to an external service. Confirm authorization for the material being shared
before invoking it. Label scores as tool diagnostics. The separate
[scoring service API](../../../services/resume-scoring/README.md#api) can score supplied text or
PDF bytes and returns results without writing JobOps records. See the
[résumé storage contract](../../README.md#resume-storage-and-backup) and
[application workflow reference](../../../.claude/skills/job-apply/references/jobops-api.md).

### Naukri and protected reads

| Method and path | Use |
| --- | --- |
| `GET /api/v1/naukri` | Check the last verified profile update and recent update history. |
| `POST /api/v1/naukri` | Record a verified update with `action`, `evidence`, `verified: true` and optional `indiaDate`, after checking the result on Naukri. |
| `GET /api/export?entity={entity}&format=json` | **Protected.** Export `jobs`, `applications`, `contacts`, `candidate`, or legacy `missions` when a full dataset is needed. Jobs, applications and contacts also support CSV. Prefer scoped lookups for individual records. |
| `GET /api/evidence/{id}` | **Protected.** Read a retained legacy evidence attachment by its exact ID. |

The Naukri API records what happened. Perform profile changes through the permitted Naukri
workflow. See the [Naukri maintenance instructions](../../../.claude/skills/job-apply/references/naukri.md).

## Steps outside the automation API

- Discover and verify live openings on job sources and employer career sites. Use the JobOps
  jobs editor or import UI to save a standalone opening. There is no general `/api/v1/jobs`
  create or search route.
- Use permitted employer and messaging surfaces for forms, referral requests, and outreach.
  Get approval before sending outreach. In the repository's application workflow, show the
  completed form and exact résumé for review, then leave final Submit to the user. Handle
  sign-in, CAPTCHA, signatures, consent and missing material facts with the user.
- Use the JobOps profile and settings UI for standard answers or candidate profile edits.
  Use the appropriate product workflow for deletion, archive, restore, or other changes
  absent from the inventory, subject to the user's authorization.
- Retired `/api/v1/tasks/...` routes return `410`. Start from active application, company,
  mail, or résumé records for new work.
