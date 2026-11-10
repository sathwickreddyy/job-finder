# JobOps operations

Resolve the repo from its `AGENTS.md`. Run commands there. `JOBOPS_URL=http://127.0.0.1:3210` works only on the JobOps machine; remote agents need the approved reachable address. Keep the existing Docker setup. Prefer APIs when supported. Read every response/error. Use private JSON files with `--data-binary @file`, never interpolated shell payloads.

Read the [shared API automation guide](../../../../jobops/docs/api/automation.md) for the full route inventory and authorization rules. For an existing record, use the [transition API](../../../../jobops/docs/api/application-transitions.md) to read and record valid actions. Use the mail API when an email supplies the evidence.

## Read records

```sh
JOBOPS_URL="http://127.0.0.1:3210"
curl --fail-with-body --silent --show-error "$JOBOPS_URL/api/v1/resumes"
curl --fail-with-body --silent --show-error "$JOBOPS_URL/api/v1/companies/schema"
curl --fail-with-body --silent --show-error --get --data-urlencode 'company=COMPANY' "$JOBOPS_URL/api/v1/applications"
curl --fail-with-body --silent --show-error --get --data-urlencode 'url=OFFICIAL_JOB_URL' "$JOBOPS_URL/api/v1/applications"
```

Replace illustrative values before use. Applications take **exactly one** filter per call. Compare URL/requisition, method, status and actual `appliedAt`; preparation/outreach is not a submission. Current application code allows posting age **0–14 India calendar days inclusive**. Future or unknown dates need verification. This replaces the older skill's conflicting `today−13` shortcut; recheck after waiting.

`GET /api/v1/resumes` separates `masters` (source ids/current `revisionId`/`docxUrl`) from `resumes` (application PDF ids/families/labels/`isCurrent`/`docxPath`). Ask if the relevant family/master is ambiguous.

| Need | Existing interface |
| --- | --- |
| Read source/ledger | `GET /api/v1/resumes/{masterId}/master` |
| Download selected source DOCX | `GET /api/v1/resumes/{masterId}/master/file?revision={revisionId}`; pin the id read from current master metadata |
| Download application PDF | `GET /api/resumes/{versionId}/file?download=1` (not under `/v1`) |
| Read uses and original filename | `/resumes?file={versionId}` → Used for; list API has no full usage/hash data |
| Read exact saved JD, scores and brief | `GET /api/v1/resumes/{versionId}/fit` |
| Read reviewed terms and exact JD | `GET /api/v1/jobs/snapshots/{snapshotId}/terms` |
| Suggest terms | `POST /api/v1/jobs/snapshots/{snapshotId}/terms/suggest` |
| Save reviewed terms | `PUT /api/v1/jobs/snapshots/{snapshotId}/terms` with `{ "terms": [...] }`; read `jobops/src/features/resumes/score/terms.ts` |
| Run one tool on extracted uploaded PDF | `POST /api/v1/resumes/{versionId}/score` with `{ "snapshotId": "UUID", "tool": "jobops-lexical" }`; tools also `resumenext`, `resume-ats-optimizer` |

Pin the DOCX download to the selected current revision: an unqualified `/master/file` can change between metadata lookup and download if another assistant updates the source. Preserve the exact downloaded revision and reconcile new corrections if the master changes before finalization.

Save the full JD through `/jobs/new` or its existing editor/import UI; there is no general REST `/api/v1/jobs` creation endpoint. Preserve the exact immutable snapshot. If its id is unavailable before upload, retain the exact JD text/hash privately and use consistently; `/fit` can create/link the snapshot after the used PDF is uploaded. Never invent an id or claim unsaved text has a saved snapshot.

## Company and master writes

Find a company via `GET /api/v1/companies?q=...&status=ALL`, then read its canonical detail. `POST /api/v1/companies` upserts verified identity; PATCH the existing id/slug when known. Read `/companies/schema` and `jobops/README.md` first. Preserve aliases/facts/slugs, and resolve 409 using returned canonical identity. Create with known `slug`, `name`, `websiteUrl`, `careersUrl`; save sourced ROLE facts where useful. A page does not establish compensation shortlist eligibility. Do not unarchive removed companies or fabricate qualification evidence; ask about an exception if needed.

For a master revision, edit a downloaded copy, then multipart `POST /api/v1/resumes/{masterId}/master`: `file` (DOCX), `reason`, `expectedRevisionId`, optional `sourceDate`/baseline `pdf`. `removedDisposition=retained` keeps removed reusable wording; `incorrect` excludes corrected/unsupported claims. On 409 reload/reconcile instead of overwriting. Retain the returned source revision id in application change notes.

## Upload and record fit

After submission, upload the exact used PDF through `POST /api/v1/resumes` using multipart `file` (`curl --form "file=@$pdf;type=application/pdf"`), family `resumeId` from the list API, `versionLabel`, and optional `changeNotes` and `docxPath`. The client reads the local file. The upload does not change the default PDF. Verify the response `sha256` against the local attachment, then use the returned `versionId`. Repeating the same family, label and bytes returns the existing version. If the deployed JobOps version lacks this route, use the résumé Upload revision drawer with the default option unticked, then verify the hash of the downloaded PDF.

`POST /api/v1/resumes/{versionId}/fit` **records checks, it does not run them**. Body: optional `baseVersionId`/`docxPath`/known `snapshotId`, `target` with full description/provenance, and `assessments`. Read current `jobops/src/features/resumes/fit/tools.ts` and `fit/service.ts` before constructing details; `score/map.ts` shows tool-output mappings. Do not post raw tool output as mapped details. Record both baseline/selected comparisons with actual PDF ids; never pretend a source DOCX master is an application PDF baseline. Preserve a source-only baseline's raw results/hash/revision in private records and change notes if it cannot be represented as a PDF version. Missing results are unavailable, not zero/green.

## Record actual submission or outreach

Write the exact body privately, then:

```sh
curl --fail-with-body --silent --show-error -H 'Content-Type: application/json' \
  --data-binary @jobops/data/job-apply/submission.json "$JOBOPS_URL/api/v1/applications"
```

Body shape (replace all example values; omit unknown optional dates):

```json
{
  "opening": {
    "url": "https://careers.example.com/jobs/REQ-123",
    "company": "Example Company", "title": "Backend Engineer",
    "location": "Bengaluru", "description": "Exact saved description", "reqId": "REQ-123",
    "postedAt": "2026-11-03", "postedAtKind": "original",
    "postedAtSourceUrl": "https://careers.example.com/jobs/REQ-123"
  },
  "application": {
    "method": "DIRECT", "submittedAt": "2026-11-03",
    "resumeVersionId": "00000000-0000-4000-8000-000000000001",
    "notes": "Actual confirmation evidence; source master revision; referral provenance if used."
  },
  "humanConfirmed": true
}
```

`humanConfirmed` means a real user-confirmed submission/sent message, not permission to send. Current `DIRECT` represents a submitted application, including a final application via a referral link; retain referral provenance in notes. `REFERRAL` represents the **sent request**, with recipient/evidence, and is recorded separately. Confirm the exact `resumeVersionId` first: sent records lock it. Verify returned application/company links/warnings. Never repair submitted records directly in the DB without explicit approval.

Candidate answers use `/settings` → Standard answers and the profile UI. There is no active `/api/v1/candidate` route; do not use retired task/mission endpoints. [Résumé/answer handling](resumes-and-answers.md) and [mail operations](mail.md) complete this reference.
