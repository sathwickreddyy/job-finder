# Résumés and confirmed answers

Read current JobOps preferences, the current DOCX master and the latest explicit corrections in ignored `jobops/data/job-apply/confirmed-facts.json`. Use the career-positioning preference in `AGENTS.md`; do not freeze an older backend/platform label or exclusions into the user's professional identity. Experience, current employer, compensation, notice period and desired roles come from current records. Keep sourced pay and location preferences and explicit company/role exclusions; unknown pay stays unknown.

Evaluate actual responsibilities and seniority, including software engineer, software developer, backend, cloud and suitable full-stack titles. Recognize MTS/SMTS/LMTS/PMTS and their expanded names; “Member of Technical Staff” is not automatically a Staff+ level. Do not discard mixed frontend/backend roles by a frontend substring alone. A platform or data role may fit, but those specializations are not mandatory.

## Choose from confirmed source

Fetch the explicit master id/current DOCX revision through [JobOps operations](jobops-api.md). Read previous applied examples and fit briefs, reconciling their claims with current corrections/keep-out reasons. Also read ignored `jobops/data/job-apply/confirmed-facts.json` if present: explicit facts need source/date/scope and may await master/profile reconciliation. Agent guesses and unreviewed drafts are not confirmed evidence.

Reuse an existing PDF only if its exact contents remain current/appropriate. Otherwise select/re-weight from the master, preserving submitted bytes. Save local DOCX/PDF drafts under ignored `jobops/data/resume-exports/tailored/` with company/requisition/date and `Resume` in the filename. Use available DOCX/PDF authoring tools, inspect layout/text extraction, and retain editable DOCX. Application copies follow the approved single-column style; the complete source master has no page limit.

The master is a source to select from, not a template to copy. Never export it whole as an application résumé. For each role, pick the bullets that serve the exact JD (usually 5–8 for the current and previous employer, fewer for older roles), merge or shorten where it helps, and keep the copy within two pages. Application copies must not name internal teams, fleets, programs, tools or scores (for example employer-internal acronyms) that a reader outside that employer would not recognize; describe the work in plain terms and keep the metric. The master's dated ledger can hold internal context that its bullets omit; that context is not reusable résumé wording.

An earlier tailored résumé is a selection for one opening, not a complete inventory or a new default specialization. Match the exact JD against the complete source and current corrections before selecting evidence. Keep broad cloud experience, confirmed frontend project work and supporting data exposure at their established depth; do not claim equal expertise or total-career years in every skill.

Confirmed personal/GitHub projects, including AI-assisted work, can demonstrate React/Next.js and other skills without an employer example. Label project provenance and do not convert it into professional tenure, employer attribution or production scale. An explicit requirement for professional frontend years remains a separate fit question. Respect the user's presentation preference: do not automatically add a Projects section to application copies. Omitting that section is not permission to ignore project evidence when matching or selecting supported skills.

Ask about unresolved gaps in one batch. A confirmed skill without employer/project details permits a skills-line mention, not an invented bullet or metric. Negative answers become keep-out reasons. Save confirmed additions/corrections as dated master revisions, retaining removals and excluding incorrect claims. Application-only omissions do not remove source material. Reconcile assistant-only confirmed facts into the master/profile before relying on them; a private shared fact record can preserve provenance while a write is pending.

## Compare all three checks

Keep the exact JD, link/publication provenance, reviewed requirements and tool outputs privately. Every `jd_quote` must occur verbatim. Requirements reflect the JD; do not demote missing must-haves to improve colour. The master baseline PDF contains source résumé content, not its dated change ledger.

| Check | Actual interface |
| --- | --- |
| Local keyword check | `POST http://127.0.0.1:3212/v1/assessments/pdf`, multipart `resume` and `metadata` |
| ResumeNext | Available `match_resume_to_job` connector, or already-configured port-8004 MCP bridge using its supported client; PDF-extracted text and full JD without added `SOURCE:`/`POSTED:` metadata |
| ATS optimizer | `POST http://127.0.0.1:3212/v1/ats-optimizer/pdf`, same multipart inputs; required-term coverage, frequencies/locations and formatting checklist; consult installed `resume-ats-optimizer` guidance when available |

Do not invent a bridge REST path, add another MCP, or invoke the separate ResumeNext editor tool. Use configured `X-API-Key` if the service requires it, without printing secrets. Read `/v1/metadata-schema` or service OpenAPI for current input. Current PDF limits: 10 MiB / 12 pages. An oversized source baseline is an explicit limitation; ask how to proceed rather than silently trimming it or manufacturing a score.

Example for a local PDF (repeat for master baseline/selected and optimizer path):

```sh
SCORING_URL="http://127.0.0.1:3212"
curl --fail-with-body --silent --show-error \
  -F 'resume=@jobops/data/resume-exports/tailored/Selected_Resume.pdf;type=application/pdf' \
  -F 'metadata=<jobops/data/job-apply/metadata.json' "$SCORING_URL/v1/assessments/pdf"
```

Metadata contains `job_description`, `requirements` with `term`, `aliases`, `importance` (`required`, `preferred`, `unspecified`), and verbatim `jd_quote`. Optional version/snapshot ids must be real. Optimizer needs at least one genuinely required term. Uploaded/extracted files can use `/score`; keep experimental drafts local.

Show one master-vs-selected comparison for all three tools, retaining methods/versions, evidence, matched/missing terms, frequency/location and deliberate unclaimed gaps. Explain any lower tailored score. Current green is ≥80, but inspect facts/formatting too. Below green after supported improvements, failed/unavailable tools or noncomparable inputs require the user's decision. Bind an approval to the exact file/JD; later rewrites need fresh checks. Label numbers tool diagnostics, never employer ATS scores or acceptance predictions.

## Reuse answers

Use current candidate profile/`standardAnswers`, then explicit confirmed source facts. Reuse when meaning/jurisdiction match and the answer remains current, including chosen gender or "prefer not to say". Never infer demographics from name or résumé.

Ask only for UNKNOWN/missing, conflicting, stale or context-dependent answers. India work authorization does not answer US sponsorship; pay can vary by role; notice period may change. Save newly confirmed reusable answers once in shared profile records, preserving other JSON fields and adding dates/scope in metadata when useful. New terms, consent/signatures and authorizations are separate from ordinary fact reuse.

Verify autofill, especially dates, company names, multiple roles, truncated descriptions and suggested skills. Use the observed page, not assumed ATS bugs. Add only supported skills. Pause if the user begins editing the same form.
