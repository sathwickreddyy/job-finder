---
name: job-apply
description: Use when the user asks to apply to a job opening, prepare or tailor a résumé for a specific opening, fill an application form, or record a submitted application in JobOps.
---

# Apply to an opening

Run these five steps in order for each opening. Stop at any failed gate and tell the user; never guess.
The user signs in, solves captchas, answers personal and legal questions and clicks the final Submit.

## 1. Check the opening is live

- Open the official careers page (not LinkedIn, not the saved JobOps copy). If it says "not found" or
  "taken down", or the role is missing from that company's careers search: stop. Tailor nothing. Tell
  the user and ask whether to mark it closed in JobOps.
- The official posting date must be today−13 or later in Asia/Kolkata. Use the ATS's own date
  (Greenhouse `first_published`, Ashby `publishedAt` = latest publication, Lever, Workday cxs,
  amazon.jobs `search.json`, Oracle HCM REST, Eightfold). LinkedIn dates are usually refreshes. Unknown
  date: hold.
- `GET http://localhost:3210/api/v1/applications?company=<name>` (and `?url=`) must show no earlier
  application.
- Scope: Bengaluru or Hyderabad; sourced pay above ₹32 LPA preferred, unknown stays unknown; minimum
  experience about 6 years or less; no QA/SDET, front-end, mobile, Staff+ or manager roles.

## 2. Tailor the résumé as local files only

- Start from the current editable DOCX master in `jobops/data/resume-exports/` (the newest
  `..._Backend_Platform_Resume_<date>.docx`; confirm with the user if unsure).
- Truthful re-weighting only: reorder, re-title, reword with existing evidence. Keep present tense for
  the current Morgan Stanley role. No personal or side projects.
- Save `Sathwick_Reddy_Yalla_Resume_<company>-<reqId>_<date>.docx` (keep "Resume" in the name; the ATS optimizer checks it) and its text-based PDF to
  `jobops/data/resume-exports/tailored/`.
- Do not upload anything to JobOps or create a résumé version yet.
- Gap in the JD (mentoring, design reviews, a skill): ask the user in this chat. Never add a skill,
  metric or claim they haven't confirmed.

## 3. Check the draft

Score the master PDF and the tailored PDF against the exact job description with all three tools:

| Tool | How |
|---|---|
| Local scoring service | `http://127.0.0.1:3212` — `/v1/requirements/suggest`, `/v1/assessments/pdf`, reviewed requirements with verbatim JD quotes |
| ResumeNext | `match_resume_to_job` (bridge on port 8004) with the PDF's extracted text and the full JD, `SOURCE:`/`POSTED:` lines removed |
| resume-ats-optimizer | Load the skill; formatting checklist plus matched ÷ required keywords, with frequency and location |

Show the user one side-by-side table: master vs tailored per tool, matched and missing terms, gaps left
unclaimed on purpose. A tailored score below the master on any check needs a stated reason. Label every
number a tool diagnostic, never an employer ATS result. ResumeNext keyword lists are noisy: show them,
don't chase them.

## 4. Apply

- Use the built-in browser pane; the user watches it. The user signs in there.
- Fill every field you can source without asking: the tailored résumé, JobOps `candidate_profiles`
  (name, email, phone, city, notice period, pay, `standard_answers`) and facts the user confirmed.
  Ask only for facts stored nowhere (e.g. street address), in one batched message. Terms and consent
  boxes still need the user's go-ahead.
- Check what Workday autofill parsed: it drops company names, cuts role descriptions after the first
  bullet and leaves second roles at one employer empty. Remove suggested skills the résumé doesn't
  claim; add the JD's must-haves the résumé does.
- If the user is clicking in the same page, stop and ask instead of fighting over a field.
- Show the user the Review page and wait. Never click Submit.
- The built-in pane cannot attach files: give the user the exact file path and the field. Claude in
  Chrome may run on another machine, where `localhost` is not JobOps. Don't work around it.

## 5. Upload and record — only after the user confirms they submitted

1. Ask: "Which résumé file did you attach?"
2. Open `/resumes?file=<an existing version>` in the built-in pane, click **Upload revision** and
   fill the label, change notes (job link, every change, gaps, scores) and DOCX path; leave "default"
   unticked. The user attaches the PDF and clicks Upload. Confirm the new version's `sha256` equals
   the local file's.
3. Record the three checks with `POST /api/v1/resumes/{versionId}/fit`: `baseVersionId` = the
   current résumé, `snapshotId` = the saved description, `target` with posting date, and six
   assessments (each tool for base and tailored) in the shapes `src/features/resumes/fit/tools.ts`
   validates. Put "not changing because…" in ResumeNext issue `decision`s and unclaimed-gap reasons in
   lexical requirement `note`s.
4. `POST /api/v1/applications`:

```json
{
  "opening": { "url": "...", "company": "...", "title": "...", "location": "...", "reqId": "...",
               "postedAt": "YYYY-MM-DD", "postedAtKind": "original", "postedAtSourceUrl": "..." },
  "application": { "method": "DIRECT", "submittedAt": "YYYY-MM-DD", "resumeVersionId": "<uuid>" },
  "humanConfirmed": true
}
```

JobOps locks the résumé once the record is sent, so `resumeVersionId` must be right the first time.

## Never without asking

- Delete or archive openings, résumé versions or files. Archive rather than delete; never touch a
  version that has been sent.
- Revise an earlier submitted application because a newer variant exists.
- Apply to Tracxn/Hirist.
