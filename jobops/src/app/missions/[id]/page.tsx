import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import { Button, EmptyState, Field, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { getMission } from "@/features/missions/service";
import { startMission, updateMissionStep } from "@/features/missions/actions";
import { OPERATORS, terminalStatuses } from "@/features/missions/domain";
import { MISSION_LABELS } from "@/features/missions/templates";
export const dynamic = "force-dynamic";
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
export default async function MissionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getMission(id);
  if (!detail) notFound();
  const preferences = await getDisplayPreferences();
  const dateLabel = (value: Date) => displayDate(value, preferences, true);
  const {
    mission,
    steps,
    executions,
    evidence,
    activity,
    context,
    resume,
    relatedApplication,
    relatedJob,
  } = detail;
  const closed = terminalStatuses.has(mission.status);
  const active = executions.some((execution) => execution.status === "IN_PROGRESS");
  return (
    <>
      <PageHeader
        title={mission.title}
        description={`${MISSION_LABELS[mission.type]} · ${mission.id}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/missions/${id}/agent`}>Agent view</Link>
            </Button>
            <CopyLink path={`/missions/${id}/agent`} label="Copy agent link" />
            <Button variant="outline" asChild>
              <a href={`/missions/${id}/context.json`}>Context JSON</a>
            </Button>
            {!closed && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/missions/${id}/edit`}>Edit mission</Link>
                </Button>
                <Button asChild>
                  <Link href={`/missions/${id}/result`}>Record result</Link>
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StatusBadge status={mission.status} />
        <span className="text-sm text-muted-foreground">
          Priority: {mission.priority === 1 ? "High" : mission.priority === 3 ? "Low" : "Normal"}
        </span>
        {Array.isArray(mission.constraints.safety) &&
          mission.constraints.safety.map((safety) => (
            <span key={String(safety)} className="rounded border border-border px-2 py-1 text-xs">
              {String(safety)}
            </span>
          ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Panel title="Goal">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{mission.goal}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {context.relatedLinks.entity && (
                <Button asChild variant="outline">
                  <Link href={context.relatedLinks.entity}>
                    Open {mission.entityType.toLowerCase()}
                  </Link>
                </Button>
              )}
              {relatedJob && (
                <Button asChild variant="outline">
                  <a href={relatedJob.canonicalUrl} target="_blank" rel="noreferrer">
                    Open original job
                  </a>
                </Button>
              )}
              {relatedApplication && (
                <Button asChild variant="outline">
                  <Link href={`/applications/${relatedApplication.id}`}>Open application</Link>
                </Button>
              )}
              {resume && (
                <Button asChild>
                  <a href={`/api/resumes/${resume.id}/file?download=1`}>Download selected resume</a>
                </Button>
              )}
            </div>
            {resume && (
              <p className="mt-3 text-xs text-muted-foreground">
                Selected resume:{" "}
                <Link className="text-primary" href={`/resumes/${resume.resumeId}`}>
                  {resume.resumeName} · {resume.versionLabel}
                </Link>
              </p>
            )}
          </Panel>
          <Panel title="Steps">
            <ol className="space-y-5">
              {steps.map((step) => (
                <li key={step.id} className="border-b border-border pb-5 last:border-0 last:pb-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {step.sequence.toString().padStart(2, "0")}
                    </span>
                    <h3 className="text-sm font-medium">{step.title}</h3>
                    <StatusBadge status={step.status} />
                    {step.requiresApproval && (
                      <span className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-500">
                        Human approval required
                      </span>
                    )}
                  </div>
                  <p className="ml-6 whitespace-pre-wrap text-sm text-muted-foreground">
                    {step.instruction}
                  </p>
                  {!closed && (
                    <ActionForm action={updateMissionStep} className="ml-6 mt-3">
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="stepId" value={step.id} />
                      <div className="flex flex-wrap items-end gap-2">
                        <Field name={`status-${step.id}`} label="Step status">
                          <select id={`status-${step.id}`} name="status" defaultValue={step.status}>
                            {["PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED", "SKIPPED"].map(
                              (status) => (
                                <option key={status}>{status}</option>
                              ),
                            )}
                          </select>
                        </Field>
                        {step.requiresApproval && (
                          <label className="flex items-center gap-2 text-xs">
                            <input type="checkbox" name="approved" />
                            Human approved this step
                          </label>
                        )}
                        <Button variant="outline" type="submit" size="sm">
                          Update step
                        </Button>
                      </div>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Evidence and results">
            {evidence.length ? (
              <ol className="space-y-4">
                {evidence.map((item) => (
                  <li key={item.id} className="border-b border-border pb-4 last:border-0">
                    <div className="mb-1 flex gap-2 text-xs text-muted-foreground">
                      <span>{item.type}</span>
                      <time>{dateLabel(item.createdAt)}</time>
                    </div>
                    {item.storagePath ? (
                      <a
                        className="text-sm text-primary hover:underline"
                        href={`/api/evidence/${item.id}`}
                      >
                        Download {item.value}
                      </a>
                    ) : item.type === "URL" && /^https?:\/\//.test(item.value) ? (
                      <a
                        className="break-all text-sm text-primary hover:underline"
                        href={item.value}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm">{item.value}</p>
                    )}
                    {Object.keys(item.metadata).length > 0 && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          Result details / structured evidence
                        </summary>
                        <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-muted p-3">
                          {pretty(item.metadata)}
                        </pre>
                      </details>
                    )}
                    {item.executionId && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Execution: {item.executionId}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                No evidence recorded yet. Start an execution, then capture its result.
              </p>
            )}
          </Panel>
        </div>
        <div className="space-y-5">
          {!closed && !active && mission.status !== "DRAFT" && (
            <Panel title="Start execution">
              <p className="mb-4 text-sm text-muted-foreground">
                Choose who performs the work. JobOps records the operator and never invokes a model
                or external portal.
              </p>
              <ActionForm action={startMission}>
                <input name="id" type="hidden" value={id} />
                <Field name="operator" label="Operator">
                  <select id="operator" name="operator" defaultValue={detail.defaultOperator}>
                    {OPERATORS.map((operator) => (
                      <option key={operator}>{operator}</option>
                    ))}
                  </select>
                </Field>
                <Field name="notes" label="Execution notes">
                  <textarea id="notes" name="notes" rows={2} />
                </Field>
                <Button type="submit">Start execution</Button>
              </ActionForm>
            </Panel>
          )}
          {mission.status === "DRAFT" && (
            <Panel title="Draft mission">
              <p className="text-sm text-muted-foreground">
                Review the plan and set its status to READY before starting an execution.
              </p>
              <Button className="mt-3" asChild>
                <Link href={`/missions/${id}/edit`}>Review draft</Link>
              </Button>
            </Panel>
          )}
          <Panel title="Constraints">
            <pre className="overflow-auto whitespace-pre-wrap text-xs leading-relaxed">
              {pretty(mission.constraints)}
            </pre>
          </Panel>
          <Panel title="Success criteria and expected output">
            <pre className="overflow-auto whitespace-pre-wrap text-xs leading-relaxed">
              {pretty(mission.expectedResult)}
            </pre>
          </Panel>
          <Panel title="Execution history">
            {executions.length ? (
              <ol className="space-y-4">
                {executions.map((execution) => (
                  <li key={execution.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{execution.operator}</span>
                      <StatusBadge status={execution.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dateLabel(execution.startedAt)}
                      {execution.completedAt ? ` → ${dateLabel(execution.completedAt)}` : ""}
                    </p>
                    {execution.notes && (
                      <p className="mt-1 whitespace-pre-wrap text-sm">{execution.notes}</p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No attempts recorded.</p>
            )}
          </Panel>
          <Panel title="Activity timeline">
            {activity.length ? (
              <ol className="space-y-3">
                {activity.map((item) => (
                  <li key={item.id}>
                    <p className="text-sm">{item.summary}</p>
                    <time className="text-xs text-muted-foreground">
                      {dateLabel(item.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="No activity" description="Mission changes appear here." />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
