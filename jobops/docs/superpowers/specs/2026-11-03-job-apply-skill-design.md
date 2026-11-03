# Job apply skill: shared workflow design

Status: approved for implementation on 3 November 2026. This records the conversation's decisions; the document itself does not install an automation or authorize an external submission. No application code changes are proposed.

## Purpose

Help the user apply to one specified opening, using JobOps as the shared record. The instructions must be understandable to a person and portable between Codex, Claude Code and other assistants. Another assistant must be able to continue from the recorded facts without relying on a previous assistant's private memory.

Use a numbered playbook. Each step states its input, action, decision branches, next step and evidence to retain. Keep exact API examples and tool-specific instructions in supporting references. Keep private answers, documents, scan results and execution checkpoints out of tracked skill files.

This extends the existing `.claude/skills/job-apply/SKILL.md`. It is an applying skill, not a new discovery dashboard, autonomous mailing campaign or cold-email strategy. JobOps remains a Docker application with external assistants performing browser work; no LLM calls are added to Next.js.

## Decisions confirmed in this conversation

- If an opening is unspecified or ambiguous, ask the user which opening. Do not pick one automatically.
- Prefer a realistic referral opportunity when available. Wait 24 hours after an actually sent request for a response. After a positive response agreeing to help, allow another 24 hours for referral completion. On no response, a decline, or an incomplete referral at that second deadline, proceed to the direct-application path if the opening is still eligible.
- Prepare the résumé while waiting for a referral.
- Aim for green in all three scoring tools through truthful improvements. If a tool remains below green after those improvements, explain the remaining gaps and ask whether to proceed.
- Refresh mail before and after applying. Include responses from other applications and verify company-specific search rules and the actual provider queries.
- Urgent mail, such as another company's interview invitation, pauses the current application. Show the message and deadline. The user's acknowledgement that they have noticed it is sufficient to resume; handling the email can remain pending.
- Perform a Naukri profile update daily at 09:00 Asia/Kolkata, with an evening retry if necessary. Any genuine minor or major update is acceptable. A verified re-upload of an approved general-purpose résumé can be used when no factual content change is needed.

## Existing instructions retained

Read repository instructions and current JobOps preferences at the start. Previously recorded preferences include Bengaluru/Hyderabad backend/platform openings, exclusions for QA/SDET and other excluded role types, sourced pay preferences, and the application freshness cutoff. These are inherited preferences, not newly chosen in this discussion. Changes explicitly supplied by the user take precedence.

The user reviews the completed application and performs the final Submit under the existing apply skill. Sending a referral request requires approval of its actual recipient and message. Do not send cold emails as part of this skill. Sign-in, account access, CAPTCHA, signatures, unknown material answers and explicit access refusals remain holds.

Reuse explicit answers to equivalent questions; a demographic answer must never be inferred from a name, location or résumé. A previous consent is not blanket consent to different terms. User corrections override earlier records. Do not treat silence as approval.

## Ordered application workflow

### 1. Identify and verify one opening

Input: a job link, an unambiguous company/role/requisition, or an explicitly selected saved opening.

- If the target is missing or ambiguous, ask which opening and wait.
- Fetch the official full job description and application URL. Retain the company, requisition, location, source URL, publication date, date source and whether it is original or a latest publication/repost. Discovery time is separate.
- Check that the official opening is live and meets the user's eligibility and freshness rules. A LinkedIn refresh alone is not evidence of an original posting date.
- Look for existing submissions by canonical URL and company, comparing the exact requisition so a different opening at the same company is not mistaken for a duplicate.
- Closed, ineligible or already submitted: report the evidence and stop this application. Unknown publication date or unresolved identity: hold while verifying. Do not delete or close saved records without authorization.
- Recheck the opening and freshness after a referral wait and before submission. Waiting does not extend the eligibility window.

### 2. Refresh mail and establish company tracking

- Refresh all connected inboxes from their checkpoints; continue each paginated run until complete or a reported account error. Keep other accounts' results if one fails.
- Read the target company's page and existing application/outreach history. If no company page exists, create it with verified identity and careers information. Do not invent compensation evidence or automatically qualify it for the shortlist.
- Read the company's current mail rule. Preserve its valid aliases, domains, exact senders, identifying keywords and exclusions when adding evidence.
- Use verified company domains and recruiter addresses. Add distinctive phrases such as a company's actual hiring-team display name. Generic terms such as "application" or "interview", and shared ATS domains by themselves, do not identify one company.
- Inspect the generated Gmail/Outlook queries. Run a company search when needed to verify coverage or recover known relevant messages. Inspect both kept and dropped results and each account's query/errors. Zero results is not proof that coverage is correct or that no message exists.
- Company keywords currently establish a match only in the subject or sender display name. Provider searches can retrieve a phrase from a body without JobOps retaining that message. Use the dropped reason to distinguish query retrieval from classification.
- A known relevant dropped message can be included through the existing Include this flow. Improve the rule only with observed evidence; preserve unrelated exclusions. Do not add blanket shared ATS senders that would misattribute other companies' mail.
- Surface responses from other applications. Urgent messages use the interruption branch below. Do not send replies implicitly.

### 3. Select referral or direct application

- First check known contacts, previous outreach and replies. When useful, search LinkedIn for relevant employees, hiring managers or recruiters. Use an available connector; otherwise use the user's browser session through permitted computer control. Verify identity and current company rather than treating a search snippet as proof.
- Prefer one credible contact over repeated requests to many people. Prepare a short, specific referral request and show the actual recipient and message for approval before sending. Record only a message actually sent.
- Check the employer's observed referral instructions before assuming the direct form and referral process can be combined.
- After sending, retain `requestSentAt` and its 24-hour deadline. A positive reply agreeing to help starts one further 24-hour deadline from its received time. A vague reply is not a completed referral.
- Referral completed: follow the actual referral link/instructions. No reply, decline or deadline expired: use the direct path after checking the opening is still eligible and nothing was already submitted.
- A wait does not mean sleeping in a chat for 24 hours. Where a scheduler is available, arrange a bounded follow-up and record it. Otherwise provide the deadline and next action for the user or a later agent. Never imply an assistant can wake itself without scheduling support.

### 4. Gather confirmed facts and choose the résumé

- Fetch the explicit master source and its current immutable DOCX revision through JobOps; do not infer the master from the newest local filename or current application PDF.
- Read relevant previously applied files and their recorded fits as examples of wording and emphasis. The current master, its exclusions and the user's corrections govern facts. A submitted older claim is not automatically reusable evidence.
- Compare the current master and relevant existing application PDFs against the exact saved JD. Reuse a suitable existing file if its facts remain current and its exact contents are appropriate. Otherwise create a tailored DOCX from the master by truthful selection and re-weighting, then export a text-based PDF.
- Ask only about gaps not already settled in confirmed records. Distinguish confirmed skills-line experience from detailed employer/project evidence. Ask where and how a skill was used before creating a new experience bullet.
- Save newly confirmed source facts and corrections to a new master DOCX revision with a dated reason and concurrency check. Retain earlier wording/removals; mark incorrect or unsupported claims as excluded. Application-only omissions do not remove master material.
- Keep unused tailored drafts in ignored local storage. Keep the master and exact submitted PDFs in the active résumé section. Retain the source master revision id with each application's résumé change notes.

### 5. Score and finalize

- Use the exact saved JD snapshot and one reviewed set of requirements with verbatim JD quotes. Compare like with like: same snapshot, reviewed terms and scoring method/version.
- Score the master baseline PDF and selected/tailored PDF side by side using local `resume-scoring`, ResumeNext `match_resume_to_job`, and the ATS optimizer rubric/service. An unformatted DOCX source needs a readable baseline PDF for PDF-input checks; do not score the change ledger as résumé content.
- Read the starting file's JobOps brief when available, preserving keep-out decisions and reasons. Do not reinterpret a settled "no experience" as an open invitation to add a keyword.
- Address formatting/extraction errors and supported wording gaps. Record scores, evidence, matched/missing terms, frequency/location where available, and gaps deliberately unclaimed. A lower tailored score on any check needs a stated reason.
- All three green and no unresolved factual/formatting problems: proceed to form preparation. Below green after truthful improvements: show the gaps and wait for the user's proceed/revise/stop decision. An unavailable or failed tool is unverified, not green; disclose it and ask whether to hold or proceed with that limitation.
- Green is the existing JobOps display band, not an employer's ATS acceptance result. Do not change requirements, thresholds or facts merely to change the colour.

### 6. Fill, review and submit

- Use the browser session with the required access and the exact selected PDF. Prefer existing accessible sessions over making the user log in again unnecessarily.
- Fill from the current candidate profile, master facts and explicit standard answers. Reuse equivalent confirmed answers automatically, including the user's chosen demographic answers. Check country/question meaning and dated or role-specific facts such as compensation and availability; ask only when the context differs, evidence conflicts or the answer is unknown.
- Save newly confirmed reusable answers in the shared candidate profile through supported UI routes; do not leave the only copy in Claude/Codex private memory or tracked skill files.
- Verify parsed employment, dates, skills, education and attachment identity after autofill. Batch genuinely missing questions. Use actual available upload capabilities; if attachment requires the user, provide the exact path and field and wait.
- Show the completed review page and exact attached file. The user performs final Submit under the existing rule. Wait for confirmation rather than repeatedly submitting.
- Interrupted or uncertain submission: inspect confirmation/application history before any retry. An email that has not yet arrived is not evidence that submission failed.

### 7. Record the actual submission, then refresh mail

- Confirm the exact PDF attached, especially when the user performed the upload. Preserve the bytes and DOCX lineage. Upload only the used revision if it is not already present; verify its identity/hash using supported access. Record its tool fits against the saved snapshot.
- Record the real submission date in India time, exact opening/requisition, file version, confirmation URL/evidence and referral provenance. Verify the returned application and company links. Do not mark an unsent form or a referral request as a submitted application.
- Refresh new mail across connected inboxes again, continuing pages and checking account failures. Retain acknowledgements and other replies. If none has arrived, finish with the actual application confirmation and say the email acknowledgement is pending; do not keep polling indefinitely.
- Inspect any newly observed ATS sender/display name and refine the company's rule with that evidence. Verify that resulting messages are assigned to the right company/application. Respect manual links, tags, outcomes and dismissals; do not undo them through a rescan.
- Finish with the application result, exact résumé and any pending action. Preserve a minimal private checkpoint for a held or interrupted run so a different agent can continue without duplicate outreach or submission.

## Urgent-mail interruption branch

At a mail check or another permitted observation, an interview/assessment invitation, time-sensitive recruiter request or offer deadline interrupts the current application. Preserve the current step, target opening, selected file and whether anything has been submitted. Show the company, sender, requested action, known deadline and message link. Unknown deadlines remain unknown.

Wait until the user acknowledges noticing it. Then recheck page/session state and resume the saved step. The email can remain open. Do not require a reply to that email as a condition of resuming, and do not continually alert on the same acknowledged message. This is an on-demand mail workflow; it does not create a new continuous inbox monitor.

## Daily Naukri maintenance

Use a scheduled task separate from applying so days without an application still get a run. Schedule 09:00 Asia/Kolkata daily and an 18:00 retry if needed. The user approved proceeding after this evening time was proposed.

Read a private shared success record for today's India date. If already updated successfully, the evening run exits without a duplicate update. Otherwise use the user's authenticated Naukri session and make a genuine update or re-upload an approved general-purpose PDF. Confirm any major new factual content before publishing it. Do not publish the unformatted source master or automatically replace the general PDF with an unrelated tailored application copy.

Verify the actual save and displayed date when available; record the action and verification evidence only after success. If the current browser has no supported truthful refresh action or cannot verify the result, leave the attempt pending. Sign-in/CAPTCHA/access refusal calls for user assistance, not a workaround. Record the failure so the evening retry has the right context.

A scheduler cannot guarantee execution while its required computer/browser is unavailable, and activity cannot guarantee first position in recruiter searches. Report missed/blocked updates honestly. Scheduler support is a capability, not something a `SKILL.md` alone supplies. Do not create competing schedules in Codex and Claude for the same account.

## Current integration surface and constraints

The implementation reference must contain tested examples and read the current schemas before writes. These are existing interfaces, not proposed new endpoints:

| Need | Existing surface | Important constraint |
| --- | --- | --- |
| Company lookup/upsert | `GET /api/v1/companies`, company detail, `POST /api/v1/companies`, `/batch`, `/schema` | Preserve company identity and existing sourced facts. Creating a page does not prove shortlist eligibility. |
| Duplicate application check | `GET /api/v1/applications?url=...` or `?company=...` | Exactly one filter per call. Compare requisitions and sent status. |
| Résumé discovery | `GET /api/v1/resumes` | `masters` identifies source DOCX revisions separately from application PDFs in `resumes`. |
| Read/update master | `GET /api/v1/resumes/{id}/master`, `/master/file`; multipart `POST /master` | Supply `expectedRevisionId`; resolve a conflict by reloading, never overwriting blindly. |
| Read brief / record fit | `GET` / `POST /api/v1/resumes/{id}/fit` | `POST /fit` records results; it does not calculate them. Preserve JD snapshot and source revision lineage. |
| Score uploaded PDF | `POST /api/v1/resumes/{id}/score` | One tool and a `snapshotId` per call; needs an extracted uploaded file. Local drafts use the scoring service/bridge directly before upload. |
| Candidate answers | Candidate profile/settings UI | `standardAnswers` exists, but there is no active `/api/v1/candidate` route. Do not invent one or use retired task/mission APIs. |
| Upload application PDF | Résumé upload UI / existing server actions | No general REST PDF-upload endpoint is currently exposed under `/api/v1/resumes`. Do not instruct another agent to call a fictional POST route. |
| Fetch new mail | `POST /api/v1/mail/check` | Start from checkpoints; continue with no new window while `more` is true. Report per-inbox failures. |
| Company rule/query inspection | `GET /api/v1/mail/company/{key}/search` | Returns rule, inboxes, actual next queries, last run and dropped messages. Keywords do not match arbitrary body text in the sorter. |
| Update mail rule | `PUT /api/v1/mail/company/{key}/rule` | Replaces the whole rule: read, merge, write and verify. |
| Company search | `POST /api/v1/mail/company/{key}/search` | New window/options only on first request; continue with `{}` while `more` is true. Avoid repeating a full history search per application. |
| Include known dropped mail | `POST /api/v1/mail/{trackingId}/include` | Shared senders need particular care; retain the service's evidence and suggested keyword. |
| Record submission/outreach | `POST /api/v1/applications` | Record-only, requires `humanConfirmed: true`. Current `DIRECT` means a submitted application; `REFERRAL` is outreach. A completed application through a referral link must still record the submission and preserve referral provenance in notes, separately from the request. |

Use `http://127.0.0.1:3210` only when the agent runs on the JobOps machine. A browser or assistant on another machine needs the approved reachable JobOps address; its `localhost` is different. Keep scoring in the Python service and ResumeNext bridge. Do not add an MCP server, modify Docker/shared infrastructure or start host-side application servers as part of skill authoring.

## Portability and implementation choices

- Use one canonical, versioned skill and shared references, exposed in the assistant-specific discovery directories without maintaining divergent copies. Document a direct read/manual path for agents that do not auto-discover skills.
- Keep the main instructions readable without tool names from one vendor. Supporting references map intents to actual REST calls and browser actions. If a capability is unavailable, explain the exact manual step, preserve the checkpoint and wait for evidence of completion rather than skipping the step.
- Private checkpoint data should include only necessary ids/links, step, chosen file/hash, source revision, JD snapshot, confirmed decisions, referral timestamps, notification acknowledgement and next action. Use ignored `jobops/data/` storage and existing JobOps records; do not add a new progress dashboard or workflow subsystem.
- The exact scheduler adapter, minimal private file format and browser API are builder choices. An unavailable adapter must not be described as installed or working. Update the root README skill inventory when the shared skill is installed.
- Preserve existing recorded user facts; migrate necessary confirmed facts from assistant-only notes into supported shared records before depending on them. Do not copy personal records into the public skill.

## Validation before calling the skill ready

Validate skill metadata, references and discovery in both supported assistants. Exercise read-only API examples against the actual schemas. Use isolated scenario tests rather than live submissions, sent messages or Naukri edits to test branches: missing opening; duplicate requisition; referral timeout/positive response; stale role after waiting; below-green or failed score; master revision conflict; reused answer with changed country; shared ATS sender and dropped mail; one failed inbox; urgent-mail acknowledgement and resume; uncertain submission; Naukri already updated or login-blocked; another agent missing a browser/tool.

Do not claim end-to-end live validation from a written review. Actual scheduling, daily maintenance and application submission must each have their own observed evidence. No commit or push is authorized by this design discussion.
