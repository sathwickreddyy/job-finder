# Shared job apply skill implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` inline. The user approved implementation on 3 November 2026; do not add another plan approval gate or commit automatically.

**Goal:** Deliver one portable applying playbook with the agreed referral, scoring, mail and daily Naukri branches.

**Architecture:** Keep `.claude/skills/job-apply/` as the canonical existing skill and expose that same directory through `.agents/skills/job-apply`. Add focused references for JobOps operations, résumé/answer handling, mail, handoffs and Naukri. Schedule daily maintenance through the Codex automation tool; private operational data stays in ignored `jobops/data/`.

**Tech stack:** Markdown, standard Agent Skills metadata, existing REST APIs and browser controls, Codex heartbeat scheduling. No new runtime dependencies.

**Spec:** `jobops/docs/superpowers/specs/2026-11-03-job-apply-skill-design.md`.

## Constraints

- No application code, database, Docker, CI or new MCP changes.
- No invented answers, unsupported claims, unapproved outreach or final Submit.
- Missing/ambiguous opening means ask; no automatic selection.
- Referral waits are 24 hours, then another 24 hours after a positive response.
- Below-green or unverified scores require a user decision.
- Urgent mail pauses until noticed, then resumes without requiring email resolution.
- Naukri runs at 09:00 and retries at 18:00 Asia/Kolkata only if not already successful.
- No commits or pushes. Update the root README's installed skill inventory.

## Review focus

- Another assistant must find the same source, including every reference, through either installation path.
- Examples must distinguish record-only fit/submission APIs from actual scoring/submission.
- A failed inbox must not lose other inboxes' progress or trigger an unbounded retry loop.
- A positive referral reply is not a completed referral or submitted application.
- A scheduled task must not edit private facts or claim success without observing a real save.

## Task 1: Shared skill and references

- [x] Run a read-only baseline simulation against the old skill to identify missing branches.
- [x] Update `.claude/skills/job-apply/SKILL.md` with a readable ordered workflow and reference links.
- [x] Add `agents/openai.yaml` with default automatic invocation and a `$job-apply` example.
- [x] Add `references/jobops-api.md`, `resumes-and-answers.md`, `mail.md`, `referrals-and-handoff.md`, and `naukri.md` with actual interfaces and bounded fallback behavior.
- [x] Expose the canonical skill at `.agents/skills/job-apply` without divergent copies.
- [x] Update root `README.md` inventory and invocation/manual-reading instructions.
- [x] Validate metadata, references, symlink resolution and whitespace; smoke-test read-only API examples when JobOps is reachable.
- [x] Run a fresh-context scenario evaluation of the updated skill; correct observed omissions.

## Task 2: Daily Naukri scheduling

- [x] Inspect existing automations and avoid a duplicate Naukri schedule.
- [x] Create one heartbeat schedule for 09:00 and 18:00 in the user's India timezone; the evening run consults private success state before acting.
- [x] Bind the prompt to `references/naukri.md`, keep its maintenance task separate from choosing/applying for an opening, and use existing browser access.
- [x] Verify the tool's saved schedule and status. If a live profile attempt is possible, verify it through the UI; record any actual access/setup limitation without claiming an update.
- [x] Record validation evidence in this plan and mark the design approved. Report the exact remaining limitation, if any.

## Verification evidence

Completed on 3 November 2026; no application code or infrastructure changed, no commits created.

- Baseline simulation identified missing referral deadlines, score gate, authoritative master selection, mail and maintenance branches, plus ambiguous personal-answer reuse.
- Fresh-context evaluation/source review: 13/13 written fixtures passed. It exercised missing opening, reply-relative referral clocks, stale role after waiting, below-green/unavailable tools, equivalent demographic answers vs changed work jurisdiction, urgent-mail notice/resume, partial inbox failures, shared ATS/body-only dropped mail, source revision choice, uncertain submission, maintenance deduplication/block, and referred submission record semantics.
- Review corrections: recheck eligibility/duplicates immediately before final review after any hold; inspect the bounded unfiltered dropped ledger for company-unmatched messages; pin master downloads with `?revision=` to prevent concurrent source-update lineage races.
- Bundled `quick_validate.py` passed using cached PyYAML through `uv run --offline --with pyyaml`; the system Python lacks PyYAML. Project dependencies were unchanged.
- Local metadata/link/JSON/whitespace checks passed; Codex's discovery symlink resolves to the exact canonical Claude skill and all relative references exist.
- Read-only live JobOps checks passed: résumé list (separate sources/PDFs), company schema, Target application lookup, attention mail list, selected revision-pinned master DOCX download and an existing PDF's fit. Target company search returned three inbox query previews; its saved keyword list was empty, so this was not a live positive keyword-match test. Query semantics were checked against source and simulated cases.
- Existing explicitly confirmed work-skill facts/exclusions were preserved with source/date/scope in ignored shared storage; no résumé/profile was rewritten during setup.
- Native automation `refresh-naukri-daily` is ACTIVE, heartbeat bound to this chat, with saved daily 09:00 and 18:00 times. Verified through the automation view and read-only saved configuration. Today's verified success suppresses the evening edit.
- Live Naukri attempt could not load the official profile in Chrome (`net::ERR_HTTP2_PROTOCOL_ERROR`, after an initial navigation timeout). The private receipt records a block and no success. No Naukri profile change/upload occurred. Future scheduled execution requires working browser/site access; it is not proven by a written scenario or a saved schedule.

No application submission, referral message or mailbox refresh was executed as a validation side effect. Actual submission and Naukri save each require observed evidence in their own run.
