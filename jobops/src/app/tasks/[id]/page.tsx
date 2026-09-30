import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Button, Field, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import {
  decisionAction,
  manualProposal,
  manualUpdate,
  resumeProposal,
  revokeHandoff,
} from "@/features/tasks/actions";
import { Handoff } from "@/features/tasks/handoff";
import { LiveTasks } from "@/features/tasks/live";
import { ProposalView } from "@/features/tasks/proposal-view";
import { readTask } from "@/features/tasks/read";
import { configuredOrigin } from "@/lib/security";

const approvalLabels: Record<string, string> = {
  OPENINGS: "Save these opportunities",
  RESUME: "Approve resume version",
  PROFILE: "Approve profile changes",
  APPLICATION: "Approve application submission",
  OUTREACH: "Approve sending this message",
  SHOWCASE: "Approve publishing this draft",
  PREFERENCES: "Save these preferences",
  NOTE: "Accept this result",
};
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await readTask(id);
  if (!result) notFound();
  const { task, proposals, updates, credential } = result;
  const dates = await getDisplayPreferences();
  const latest = proposals[0];
  const closed = ["COMPLETED", "CANCELLED"].includes(task.status);
  return (
    <>
      <Link href="/" className="mb-5 inline-block text-sm text-link">
        ← Home
      </Link>
      <PageHeader
        title={task.title}
        description={`Working with ${String(task.input.assistant)} · ${displayDate(task.createdAt, dates)}`}
        actions={<StatusBadge status={task.status} />}
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]">
        <div className="min-w-0 space-y-6">
          <Panel title="The goal">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{task.goal}</p>
            <details className="mt-4">
              <summary className="text-sm text-muted-foreground">
                Preferences included with this task
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm">
                {String(
                  task.input.context || "Discuss your preferences with your assistant as you work.",
                )}
              </p>
            </details>
            {typeof task.input.selectedResumeVersionId === "string" && (
              <Link
                className="mt-4 inline-block text-sm text-link"
                href={`/api/resumes/${task.input.selectedResumeVersionId}/file`}
                target="_blank"
              >
                Open original resume ↗
              </Link>
            )}
          </Panel>
          {!proposals.length && (
            <Panel title="Waiting for your assistant">
              <p className="text-sm text-muted-foreground">
                Copy the handoff to your assistant. Its progress, questions, and proposed work will
                appear here.
              </p>
            </Panel>
          )}
          {proposals.map(({ proposal, decision }, index) => (
            <Panel key={proposal.id} title={index === 0 ? "For your review" : "Earlier proposal"}>
              <p className="mb-4 text-sm font-medium">{proposal.summary}</p>
              <ProposalView payload={proposal.payload} />
              {decision ? (
                <div className="mt-5 border-t border-border pt-4">
                  <StatusBadge
                    status={
                      decision.decision === "APPROVE"
                        ? "APPROVED"
                        : decision.decision === "CHANGES"
                          ? "CHANGES_REQUESTED"
                          : "DECLINED"
                    }
                  />
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {decision.feedback ||
                      (decision.decision === "APPROVE"
                        ? "Your decision is recorded for this exact proposal."
                        : "Your decision has been recorded.")}
                  </p>
                  {Boolean(decision.effects.import) && (
                    <Link href="/opportunities" className="mt-3 inline-block text-link">
                      Open saved opportunities →
                    </Link>
                  )}
                </div>
              ) : index === 0 && !closed ? (
                <div className="mt-6 border-t border-border pt-5">
                  <ActionForm action={decisionAction}>
                    <input type="hidden" name="taskId" value={id} />
                    <input type="hidden" name="proposalId" value={proposal.id} />
                    <Field
                      name="feedback"
                      label="Feedback or changes"
                      hint="Required when asking for changes."
                    >
                      <textarea name="feedback" id="feedback" maxLength={10000} rows={3} />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" name="decision" value="APPROVE">
                        {approvalLabels[proposal.kind] ?? "Approve"}
                      </Button>
                      <Button type="submit" variant="review" name="decision" value="CHANGES">
                        Ask for changes
                      </Button>
                      <Button type="submit" variant="destructive" name="decision" value="DECLINE">
                        Decline
                      </Button>
                    </div>
                  </ActionForm>
                </div>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">
                  Superseded by a newer proposal.
                </p>
              )}
            </Panel>
          ))}
          <Panel title="Task history">
            {!closed && (
              <LiveTasks
                reviewKeys={
                  ["READY_FOR_REVIEW", "WAITING_FOR_USER"].includes(task.status)
                    ? [`${task.id}:${task.updatedAt.toISOString()}`]
                    : []
                }
              />
            )}
            {updates.length ? (
              <ol className="space-y-5">
                {updates.map((u) => (
                  <li key={u.id}>
                    <p className="text-xs text-muted-foreground">
                      {displayDate(u.createdAt, dates, true)} ·{" "}
                      {u.status === "EXECUTED"
                        ? "Reported by the operator"
                        : u.status.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{u.summary}</p>
                    {u.evidenceUrl && (
                      <a
                        className="mt-2 inline-block text-sm text-link"
                        href={u.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open evidence ↗
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                No progress reports yet. All updates stay attached to this task.
              </p>
            )}
          </Panel>
        </div>
        <div className="min-w-0 space-y-6">
          <Panel title="Work with your assistant">
            <Handoff
              id={id}
              title={task.title}
              assistant={String(task.input.assistant)}
              goal={task.goal}
              context={String(task.input.context ?? "")}
              origin={configuredOrigin()}
              apiEnabled={(process.env.JOBOPS_ACCESS_TOKEN?.length ?? 0) >= 32}
            />
            {credential && !credential.revokedAt && (
              <div className="mt-5 border-t border-border pt-4">
                <ActionForm action={revokeHandoff}>
                  <input type="hidden" name="taskId" value={id} />
                  <p className="text-xs text-muted-foreground">
                    Task access expires {displayDate(credential.expiresAt, dates)}.
                  </p>
                  <Button type="submit" variant="ghost">
                    Revoke agent access
                  </Button>
                </ActionForm>
              </div>
            )}
          </Panel>
          {!closed && (
            <Panel title="Continue here">
              <p className="mb-4 text-xs text-muted-foreground">
                Use these if your assistant cannot reach the API, or when working manually.
              </p>
              {typeof task.input.selectedResumeVersionId === "string" && (
                <details className="border-b border-border pb-3">
                  <summary className="text-sm">Upload a proposed resume</summary>
                  <div className="mt-4">
                    <ActionForm action={resumeProposal}>
                      <input type="hidden" name="taskId" value={id} />
                      <input type="hidden" name="requestId" value={crypto.randomUUID()} />
                      <Field
                        name="file"
                        label="Proposed PDF"
                        type="file"
                        accept="application/pdf"
                        required
                      />
                      <Field name="label" label="Revision name" required maxLength={100} />
                      <Field name="changes" label="What changed?">
                        <textarea id="changes" name="changes" required maxLength={5000} />
                      </Field>
                      <Button type="submit">Upload for review</Button>
                    </ActionForm>
                  </div>
                </details>
              )}
              <details className="border-b border-border py-3">
                <summary className="text-sm">Record progress or a question</summary>
                <div className="mt-4">
                  <ActionForm action={manualUpdate}>
                    <input type="hidden" name="taskId" value={id} />
                    <Field name="status" label="Progress">
                      <select id="status" name="status">
                        <option value="IN_PROGRESS">In progress</option>
                        <option value="WAITING_FOR_USER">Needs your answer</option>
                        <option value="FAILED">Blocked / failed</option>
                        {latest?.decision?.decision === "APPROVE" && (
                          <option value="EXECUTED">Approved external action completed</option>
                        )}
                      </select>
                    </Field>
                    {latest && (
                      <input type="hidden" name="approvedProposalId" value={latest.proposal.id} />
                    )}
                    <Field
                      name="summary"
                      id="progress-summary"
                      label="Progress summary"
                      required
                      minLength={3}
                      maxLength={5000}
                    />
                    <Field name="evidenceUrl" label="Evidence link (optional)" type="url" />
                    <Button type="submit">Save progress</Button>
                  </ActionForm>
                </div>
              </details>
              <details className="pt-3">
                <summary className="text-sm">Paste an assistant proposal</summary>
                <p className="my-3 text-xs text-muted-foreground">
                  Ask your assistant for the proposal format in the{" "}
                  <Link href="/agent-guide" className="text-link">
                    agent guide
                  </Link>
                  .
                </p>
                <ActionForm action={manualProposal}>
                  <input type="hidden" name="taskId" value={id} />
                  <Field
                    name="summary"
                    id="proposal-summary"
                    label="Proposal summary"
                    required
                    minLength={3}
                    maxLength={5000}
                  />
                  <Field name="payload" label="Proposal JSON">
                    <textarea
                      id="payload"
                      name="payload"
                      required
                      rows={8}
                      maxLength={200000}
                      className="font-mono text-xs"
                    />
                  </Field>
                  <Button type="submit">Add proposal</Button>
                </ActionForm>
              </details>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
