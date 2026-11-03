# Referral waits and portable handoffs

Check actual contacts/outreach before searching LinkedIn. Verify current company/role; search snippets are leads, not proof. Use authorized browser/connector access and stop at sign-in/CAPTCHA/refusal. Show the recipient/channel/exact message for approval before sending one relevant request. Record actual sent evidence. Cold-email campaigns are outside this skill.

| Observed state | Next action |
| --- | --- |
| Draft/approval pending | No waiting clock yet |
| Sent, no reply, under 24 hours | Prepare résumé and wait |
| No reply at 24 hours, or decline | Recheck opening/freshness/submission history; prepare direct application |
| Positive reply agreeing to refer | Allow 24 hours from its received time for completion |
| Reply asks a question / intent unclear | Show it and resolve; do not invent completion or extend clocks indefinitely |
| Referral verified complete | Follow actual instructions; check whether anything was already submitted |
| Incomplete at positive reply +24 hours | Recheck eligibility/history; prepare direct application |
| Late referral after direct submission | Report; do not submit again |

These are elapsed 24-hour periods, not next midnight. Store offset ISO timestamps and display Asia/Kolkata. A referral wait does not extend the 14-day freshness cutoff. Final application still waits for user Submit. Referral outreach is distinct from submission; see [record semantics](jobops-api.md).

Use an available native scheduler for one bounded follow-up carrying the exact opening/checkpoint; inspect existing wakeups to avoid duplicates. No scheduler → give the deadline/next action for user/later agent; never claim the chat will wake itself.

At waits/holds/interruption/uncertain submission, save a minimal private JSON checkpoint at `jobops/data/job-apply/{stable-opening-id}.json`. Use a JobOps id or stable canonical URL/requisition identity, not only company name. Read existing state and atomically replace via a temporary file, preserving valid newer facts. Keep credentials/tokens out.

Retain `schemaVersion: 1`, opening URL/company/requisition, current `step`, `nextAction`, `updatedAt`; real known job/snapshot ids and exact JD hash; selected PDF path/hash/version and source master id/revision; raw scoring-result paths and proceed-with-gaps decision bound to those inputs; and submission state/evidence. Omit unknown values rather than inventing them.

Referral fields include actual `sentAt`, `responseDeadline`, optional positive reply time/completion deadline, verified completion evidence, outreach id and scheduler id. On urgent mail retain `pausedStep`/`urgentMailId`. After acknowledgement append the id to `acknowledgedUrgentMailIds`, clear interruption and recheck page/session/file/submission state before resuming. Do not change mail attention just to acknowledge it.

On restart reconcile checkpoint with actual JobOps/browser state. A stored `submitted` state is not authorization to resubmit. Resolve uncertainty before retrying an irreversible action. Preserve all used files/earlier application references. If the user edits the same page, pause instead of overwriting them.
