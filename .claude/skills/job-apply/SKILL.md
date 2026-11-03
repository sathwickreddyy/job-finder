---
name: job-apply
description: Use when the user asks to apply for a job, work on one opening, tailor its résumé, fill or record its application, resume a referral wait, or perform the approved daily Naukri profile refresh. Not broad discovery or a cold-email campaign.
---

# Apply to one opening

Read repository `AGENTS.md` and current JobOps records first. Follow these steps in order. Private answers, documents and checkpoints stay under ignored `jobops/data/job-apply/`.

**Daily Naukri invocation:** go directly to [Naukri maintenance](references/naukri.md). It runs independently and needs no job opening.

**Unavailable capability:** explain the exact manual step, preserve the checkpoint and wait for its result. Another assistant or a person can follow this file directly; vendor-specific tools are optional adapters. Never mark an unperformed step complete.

## 1. Identify and verify

**Input:** one job link or unambiguous company/role/requisition. Missing or ambiguous → ask which opening and wait; do not choose automatically.

Fetch the official full description, live apply URL and sourced publication date. Distinguish original posting from latest publication/repost; keep discovery time separate. Check current eligibility/preferences, the 14-day India-date cutoff and prior submissions by URL and company/requisition. Follow [JobOps operations](references/jobops-api.md).

Closed, ineligible or already submitted → explain and stop this application. Unknown date or unresolved evidence → verify or hold. Another role at the company is not automatically a duplicate.

## 2. Refresh mail and establish tracking

Refresh all connected inboxes before applying, continuing pages and retaining partial successes. Read/create the company's page using verified identity. Preserve existing rules, add observed company-specific identities, inspect actual Gmail/Outlook queries, and check kept **and dropped** messages. Follow [mail verification](references/mail.md).

**Urgent mail at any step** → save the current step, show the message/action/deadline, and pause. Once the user acknowledges noticing it, resume the saved step. The email can remain open; acknowledgement is separate from handling it.

## 3. Choose referral or direct

Check contacts and actual outreach first, then relevant LinkedIn people through an available connector or permitted browser session. Verify identity and the employer's referral process. Show the actual recipient and drafted request for approval before sending.

- Request actually sent → wait **24 hours** for a response; prepare the résumé meanwhile.
- Positive reply agreeing to help → allow **another 24 hours from that reply** for completion.
- Referral completed → follow the actual referral instructions.
- No response, decline or incomplete referral at its deadline → prepare a direct application after rechecking freshness, availability and submission history.

Use [referral deadlines and handoffs](references/referrals-and-handoff.md). Schedule a bounded wakeup where supported; otherwise leave the exact deadline and next action. A chat cannot wake itself without scheduling support.

## 4. Select or build the résumé

Fetch the explicit master and its **current DOCX revision through JobOps**, not the newest filename. Read applied PDFs/fits as examples; the current master and confirmed corrections govern facts.

Reuse a suitable current PDF or create a truthful tailored DOCX from the master and export a text-based PDF. Ask only about unresolved experience gaps. Save confirmed additions/corrections in dated master revisions; keep excluded claims excluded. Follow [résumés and answers](references/resumes-and-answers.md).

## 5. Score and decide

Compare the master baseline PDF and selected/revised PDF against the **same exact JD and reviewed terms** using local scoring, ResumeNext `match_resume_to_job`, and ATS optimizer. Preserve scores, versions, evidence, gaps and source revision. Read the starting file's brief and keep-out decisions.

All three green (**80+ in current JobOps**) with facts/formatting checked → prepare the form. Below green after supported improvements, unavailable tooling, or a lower tailored score → show gaps/reasons and ask whether to revise, proceed or stop; wait for that decision.

These are tool diagnostics, not employer ATS results. Never add unsupported skills or change requirements/thresholds merely to turn a score green.

## 6. Fill, review and submit

Use the exact selected PDF and confirmed profile/standard answers. Reuse equivalent explicit answers, including demographic choices. Ask only about unknown, conflicting, stale or context-dependent facts; batch missing questions and save reusable answers in shared records.

Check autofill, employment dates, skills and attachment identity. Immediately before final review, recheck the live opening, freshness and submission history, including after any long hold. Show the completed review page and exact file. **The user performs final Submit under the existing rule.** Sign-in, CAPTCHA, signatures, new consent and refused access remain user holds. If uploading needs the user, provide the exact path and field.

Uncertain submission → inspect confirmation/history before retrying. Never submit twice.

## 7. Record, refresh and finish

After real submission, confirm which PDF was attached. Upload only the used revision if missing; preserve its DOCX/master lineage and checks. Record the exact `resumeVersionId`, India date and confirmation. [JobOps operations](references/jobops-api.md) explains supported uploads and distinguishes referral outreach from submission.

Refresh mail again, complete pagination, report account errors and refine company rules from real acknowledgement evidence. No acknowledgement yet → report pending; never infer submission failure or poll indefinitely.

Finish with result, exact résumé and next action. Preserve a [private handoff](references/referrals-and-handoff.md) for held work. Never revise earlier submitted files or delete/archive records without authorization. Do not apply to Tracxn/Hirist. Cold email remains a separate strategy.
