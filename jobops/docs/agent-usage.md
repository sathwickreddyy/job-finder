# Operating JobOps

JobOps is the record and control plane. The operator is a person or a separately supervised computer-use product. There is no LLM/API invocation, agent SDK, browser automation worker, or MCP execution in the application.

## Daily discovery with ChatGPT Work / Computer Use

1. Open Today and choose **Find today’s jobs**. Candidate job preferences prepopulate the discovery form.
2. Review roles, locations, experience, sources, freshness, maximum results and exclusions. Create the mission.
3. Open **Agent view** and copy its stable URL. In your external interactive product, instruct:

   > Open this JobOps mission URL and follow its steps exactly. Search only within its criteria. Do not apply, send email, change profiles, or exceed the result limit. Return structured job records to JobOps. Stop for unknown information or any required approval.

4. Let the supervised operator inspect Naukri, LinkedIn, company career pages or other configured sources using your normal browser session. Portal credentials stay outside JobOps.
5. Return to `/import/jobs`. Paste a JSON array using the mission's expected schema, choose **Validate and preview**, and inspect all row errors and duplicates.
6. Select skip or merge explicitly. Import, review the summary, then shortlist suitable jobs.
7. Return to the mission result form, record summary/source URLs/evidence, and complete the discovery mission. Importing records does not implicitly complete a mission.

Example import:

```json
[
  {
    "company": "Example Labs",
    "title": "Senior Backend Engineer",
    "location": "Bengaluru",
    "url": "https://example.com/careers/backend-42",
    "source": "COMPANY_CAREERS",
    "postedAt": "2026-09-30",
    "experienceMin": 4,
    "experienceMax": 7,
    "description": "Python, PostgreSQL, Kafka and distributed systems.",
    "notes": "Verified against the original career listing."
  }
]
```

Use the listing's actual dates and facts. Omit unknown optional values instead of inventing them. Never invent a source URL or contact.

## Preparing one application with Claude Cowork or Codex computer use

1. Open a shortlisted job. Review the description, snapshots and deterministic keyword comparison.
2. Choose **Create apply mission**, select the exact resume version, and review/edit the instructions before creation.
3. Open Agent view. Provide the URL to your independently supervised operator:

   > Open this mission and prepare this single application. Download only its selected resume. Use canonical candidate facts and named answers. Do not fabricate, alter the resume, send email, or press final Submit. Record unknown questions and stop for my review.

4. The operator opens the source job/application page, fills known data, uploads the selected original PDF, and stops before final submission.
5. The operator returns to **Open Result Form**, records `READY_FOR_REVIEW`, selects the application's corresponding stage, and adds the result URL and evidence. If required answers are unknown, record the questions and use `WAITING_FOR_USER` without marking the application ready or submitted.
6. You inspect the external form and result evidence. Submit manually or give the external operator a new explicit instruction for final submission.
7. After actual submission, update the application stage to `APPLIED` and check the human-confirmation control. This records the action; JobOps does not click Submit itself. The timeline preserves the transition.

An external operator's name is recorded when you start an execution. It does not connect JobOps to that product. Browser access must be available to the operator: local URLs may only be reachable by tools running on the same machine, and a remote product may require a private authenticated deployment. Unlock JobOps in the operator's browser if access-token protection is enabled; keep the token out of mission descriptions.

## Portal inspection and explicit update

1. Open Profiles and add the portal URL. Leave unknown observed fields as `UNKNOWN` until inspected.
2. Create an `INSPECT_PROFILE` mission, observe the portal, and record only supported known fields.
3. Edit the target state and inspect the known → target difference table.
4. Create an `UPDATE_PROFILE` mission. Its context captures the baseline and approved target; do not change unrelated fields or supply unknown data.
5. Apply only the explicitly approved differences externally. Record the observed state in the result and check approval for each changed field.
6. JobOps rejects unapproved/non-target changes and conflicting fields changed since the mission was created. It records previous/observed values as evidence.

Supported profile keys include `headline`, `summary`, `currentRole`, `experience`, `skills`, `preferredRoles`, `preferredLocations`, `noticePeriod`, and `currentResumeIdentifier`.

## Contacts and recruiting mail

A `FIND_CONTACT` mission researches a relevant public recruiter/hiring manager/referral contact, records source and verification status, and never messages them. Use `UNKNOWN` or `UNVERIFIED` unless a verification result was actually checked.

Import recruiting mail JSON or configure Gmail read-only in Settings. Review each classification and proposed application link. **Append reviewed event** records the message in a timeline; stage changes require an explicit reviewed choice. Low-confidence proposals never silently alter application state. JobOps never sends email.

## Entirely manual use

All these flows work with `HUMAN`. Read the mission yourself, visit the external portal, use the download link, fill the form, and record the result/evidence. Missions are optional structure around ordinary jobs, applications, resumes, contacts and profiles; the application remains useful without any computer-use product.
