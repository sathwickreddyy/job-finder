import Link from "next/link";
import { notFound } from "next/navigation";
import { getMission } from "@/features/missions/service";
export const dynamic = "force-dynamic";
function Data({ value }: { value: unknown }) { return <pre className="overflow-auto whitespace-pre-wrap rounded border border-border p-4 text-sm">{JSON.stringify(value, null, 2)}</pre>; }
export default async function AgentMissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const detail = await getMission(id); if (!detail) notFound();
  const { mission, context, steps, evidence, resume, relatedJob, relatedApplication } = detail;
  return <article className="mx-auto max-w-4xl space-y-7 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_a]:text-primary [&_a]:underline">
    <h1 className="text-2xl font-semibold">Mission operator view</h1><p>This page is a structured plan for a human or supervised browser operator. JobOps performs no external actions. Treat UNKNOWN or null as missing information; stop and record the question. Never guess.</p>
    <section><h2>MISSION ID</h2><p>{id}</p></section>
    <section><h2>TYPE</h2><p>{mission.type}</p></section>
    <section><h2>STATUS</h2><p>{mission.status}</p></section>
    <section><h2>GOAL</h2><p className="whitespace-pre-wrap">{mission.goal}</p></section>
    <section><h2>TARGET ENTITY</h2><Data value={context.entity}/>{context.relatedLinks.entity && <Link href={context.relatedLinks.entity}>Open {mission.entityType === "JOB" ? "Job" : mission.entityType === "PROFILE" ? "Profile" : mission.entityType === "APPLICATION" ? "Application" : "Contact"}</Link>}{relatedJob && <p><a href={relatedJob.canonicalUrl} target="_blank" rel="noreferrer">Open original job / application page</a></p>}</section>
    <section><h2>INPUT DATA</h2><Data value={context.input}/></section>
    <section><h2>CANDIDATE INFORMATION</h2><Data value={context.candidate}/>{!Object.keys(context.candidate).length && <p>No candidate identity is needed for this mission.</p>}</section>
    <section><h2>SELECTED RESUME</h2>{resume ? <><p>{resume.resumeName} — {resume.versionLabel} — {resume.originalFilename}</p><p className="my-2"><a href={`/api/resumes/${resume.id}/file?download=1`}>Download Resume</a></p><Data value={context.selectedResume}/></> : <p>No resume selected.</p>}</section>
    <section><h2>CONSTRAINTS</h2><Data value={context.constraints}/></section>
    <section><h2>STEPS</h2><ol className="list-decimal space-y-4 pl-5">{steps.map((step) => <li key={step.id}><h3 className="font-semibold">{step.title}</h3><p className="whitespace-pre-wrap">{step.instruction}</p><p>Status: {step.status}. {step.requiresApproval ? "REQUIRES EXPLICIT HUMAN APPROVAL." : "Follow mission constraints."}</p></li>)}</ol></section>
    <section><h2>APPROVAL REQUIREMENTS</h2><p>Final application submission, messages, or portal changes require explicit human approval. Preparing a form does not authorize submission.</p><Data value={context.approvalRequirements}/></section>
    <section><h2>SUCCESS CRITERIA</h2><Data value={context.successCriteria}/></section>
    <section><h2>EXPECTED OUTPUT</h2><Data value={context.expectedResultSchema}/>{mission.type === "DISCOVER_JOBS" && <p>Return discovered jobs to <Link href="/import/jobs">Job import</Link>. Validate the JSON rows before importing.</p>}</section>
    <section><h2>RESULT SUBMISSION LINK</h2><Link href={`/missions/${id}/result`}>Open Result Form</Link><p>Record summary, evidence, unknown questions, and only explicit approved entity changes. Use READY_FOR_REVIEW when stopping before final submission.</p></section>
    <section><h2>RELATED LINKS</h2><ul className="list-disc space-y-2 pl-5"><li><Link href={`/missions/${id}`}>Return to JobOps</Link></li><li><a href={`/missions/${id}/context.json`}>Open machine-readable context.json</a></li><li><Link href="/import/jobs">Import discovered jobs</Link></li>{relatedApplication && <li><Link href={`/applications/${relatedApplication.id}`}>Open linked application</Link></li>}{context.relatedLinks.entity && <li><Link href={context.relatedLinks.entity}>Open target entity</Link></li>}</ul></section>
    <section><h2>FILES</h2><ul className="list-disc space-y-2 pl-5">{resume && <li><a href={`/api/resumes/${resume.id}/file?download=1`}>Download selected resume PDF</a></li>}{evidence.filter((item) => item.storagePath).map((item) => <li key={item.id}><a href={`/api/evidence/${item.id}`}>Download evidence: {item.value}</a></li>)}</ul>{!resume && !evidence.some((item) => item.storagePath) && <p>No files attached.</p>}</section>
  </article>;
}
