"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Panel } from "@/components/ui";
import { createMission } from "./actions";
import { MISSION_TYPES, profileDiff, type MissionType } from "./domain";
import { MISSION_LABELS, missionTemplate } from "./templates";
import type { getMissionOptions } from "./service";

type Options = Awaited<ReturnType<typeof getMissionOptions>>;
const json = (value: unknown) => JSON.stringify(value, null, 2);
const texts = (value: unknown, fallback: string[] = []) => Array.isArray(value) ? value.join(", ") : fallback.join(", ");
function defaultEntity(type: MissionType) { if (["INSPECT_PROFILE", "UPDATE_PROFILE"].includes(type)) return "PROFILE"; if (type === "VERIFY_CONTACT") return "CONTACT"; if (["INSPECT_JOB", "COMPARE_RESUME", "PREPARE_APPLICATION", "APPLY_JOB", "FIND_CONTACT"].includes(type)) return "JOB"; if (type === "FOLLOW_UP_REVIEW") return "APPLICATION"; return "NONE"; }

export function MissionCreateForm({ options, initialType, initialEntityType, initialEntityId }: { options: Options; initialType: MissionType; initialEntityType?: string; initialEntityId?: string }) {
  const [type, setType] = useState(initialType);
  const [entityType, setEntityType] = useState(initialEntityType || defaultEntity(initialType));
  const [entityId, setEntityId] = useState(initialEntityId ?? "");
  const initialJob = options.jobs.find((item) => item.id === initialEntityId);
  const initialProfile = options.profiles.find((item) => item.id === initialEntityId);
  const initialContact = options.contacts.find((item) => item.id === initialEntityId);
  const initialPlan = missionTemplate(initialType, initialJob ? `${initialJob.company} — ${initialJob.title}` : initialProfile?.displayName ?? initialContact?.name);
  const [title, setTitle] = useState(initialPlan.title);
  const [goal, setGoal] = useState(initialPlan.goal);
  const [constraints, setConstraints] = useState(json(initialPlan.constraints));
  const [steps, setSteps] = useState(json(initialPlan.steps));
  const [expectedResult, setExpectedResult] = useState(json(initialPlan.expectedResult));
  const candidate = options.candidate;
  const preferences = { ...(candidate?.metadata.jobPreferences as Record<string, unknown> | undefined ?? {}), ...options.preferences };
  const profile = options.profiles.find((item) => item.id === entityId);
  function changeType(value: MissionType) { const plan = missionTemplate(value); setType(value); setEntityType(defaultEntity(value)); setEntityId(""); setTitle(plan.title); setGoal(plan.goal); setConstraints(json(plan.constraints)); setSteps(json(plan.steps)); setExpectedResult(json(plan.expectedResult)); }
  function chooseEntity(value: string) {
    setEntityId(value);
    const job = options.jobs.find((item) => item.id === value);
    const selectedProfile = options.profiles.find((item) => item.id === value);
    const contact = options.contacts.find((item) => item.id === value);
    const label = job ? `${job.company} — ${job.title}` : selectedProfile?.displayName ?? contact?.name ?? "the selected entity";
    const plan = missionTemplate(type, label); setTitle(plan.title); setGoal(plan.goal);
  }
  const targets = entityType === "JOB" ? options.jobs.map((item) => ({ id: item.id, label: `${item.company} — ${item.title}` })) : entityType === "PROFILE" ? options.profiles.map((item) => ({ id: item.id, label: `${item.provider} — ${item.displayName}` })) : entityType === "APPLICATION" ? options.applications.map((item) => ({ id: item.id, label: `${options.jobs.find((job) => job.id === item.jobId)?.company ?? "Application"} — ${options.jobs.find((job) => job.id === item.jobId)?.title ?? item.id} (${item.status})` })) : entityType === "CONTACT" ? options.contacts.map((item) => ({ id: item.id, label: `${item.name} — ${item.company}` })) : [];
  return <ActionForm action={createMission}>
    <Panel title="Mission plan">
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="type" label="Mission type"><select id="type" name="type" value={type} onChange={(event) => changeType(event.target.value as MissionType)}>{MISSION_TYPES.map((value) => <option key={value} value={value}>{MISSION_LABELS[value]}</option>)}</select></Field>
        <Field name="priority" label="Priority"><select id="priority" name="priority" defaultValue={String(options.defaults.priority ?? 2)}><option value="1">High</option><option value="2">Normal</option><option value="3">Low</option></select></Field>
        <Field name="entityType" label="Target entity type"><select id="entityType" name="entityType" value={entityType} onChange={(event) => { setEntityType(event.target.value); setEntityId(""); }}><option value="NONE">No entity</option><option value="JOB">Job</option><option value="APPLICATION">Application</option><option value="PROFILE">Profile</option><option value="CONTACT">Contact</option></select></Field>
        <Field name="entityId" label="Target entity"><select id="entityId" name="entityId" value={entityId} onChange={(event) => chooseEntity(event.target.value)} required={entityType !== "NONE"}><option value="">{entityType === "NONE" ? "No linked entity" : "Select an entity"}</option>{targets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
      </div>
      <div className="mt-4 space-y-4">
        <Field name="title" label="Title"><input id="title" name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={500}/></Field>
        <Field name="goal" label="Goal"><textarea id="goal" name="goal" value={goal} onChange={(event) => setGoal(event.target.value)} rows={4} required/></Field>
        {type !== "DISCOVER_JOBS" ? <Field name="resumeVersionId" label="Selected resume" hint="Application preparation and resume comparison require a real PDF version."><select key={type} id="resumeVersionId" name="resumeVersionId" defaultValue={["APPLY_JOB", "PREPARE_APPLICATION", "COMPARE_RESUME"].includes(type) ? options.resumes.find((item) => item.isCurrent)?.id ?? "" : ""}><option value="">No selected resume</option>{options.resumes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.label}{item.isCurrent ? " (current)" : ""}</option>)}</select></Field> : <input type="hidden" name="resumeVersionId" value=""/>}
      </div>
    </Panel>
    {type === "DISCOVER_JOBS" && <Panel title="Discovery criteria">
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="roles" label="Desired roles" hint="Separate roles with commas."><input id="roles" name="roles" defaultValue={texts(preferences.desiredRoles, candidate?.desiredRoles)} required/></Field>
        <Field name="locations" label="Locations"><input id="locations" name="locations" defaultValue={texts(preferences.locations ?? preferences.preferredLocations, candidate?.preferredLocations)}/></Field>
        <Field name="experienceMin" label="Minimum experience (years)" type="number" min={0} max={70} step="0.5" defaultValue={String(preferences.minExperience ?? "")}/>
        <Field name="experienceMax" label="Maximum experience (years)" type="number" min={0} max={70} step="0.5" defaultValue={String(preferences.maxExperience ?? "")}/>
        <Field name="freshnessDays" label="Posted within (days)" type="number" min={1} max={365} defaultValue={Number(options.defaults.freshnessDays ?? 7)} required/>
        <Field name="maxResults" label="Maximum results" type="number" min={1} max={100} defaultValue={Number(options.defaults.maxResults ?? options.defaults.maximumResults ?? 30)} required/>
        <Field name="requiredKeywords" label="Required keywords"><input id="requiredKeywords" name="requiredKeywords" defaultValue={texts(preferences.preferredTechnologies)}/></Field>
        <Field name="excludedKeywords" label="Excluded keywords or roles"><input id="excludedKeywords" name="excludedKeywords" defaultValue={texts(preferences.excludedRoles)}/></Field>
        <Field name="companies" label="Companies (optional)"/>
      </div>
      <fieldset className="my-4"><legend className="mb-2 text-sm font-medium">Sources</legend><div className="flex flex-wrap gap-4">{["NAUKRI", "LINKEDIN", "COMPANY_CAREERS", "INSTAHYRE", "WELLFOUND", "CUTSHORT"].map((source) => <label className="flex items-center gap-2 text-sm" key={source}><input name="sources" value={source} type="checkbox" defaultChecked={["COMPANY_CAREERS", "NAUKRI", "LINKEDIN"].includes(source)}/>{source.replaceAll("_", " ")}</label>)}</div></fieldset>
      <Field name="discoveryNotes" label="Discovery notes"><textarea name="discoveryNotes" id="discoveryNotes" rows={3}/></Field>
    </Panel>}
    {type === "UPDATE_PROFILE" && profile && <Panel title="Explicit profile differences"><p className="mb-3 text-sm text-muted-foreground">Only these target fields can be recorded as an update. Human approval is required for each changed field.</p>{profileDiff(profile.knownState, profile.targetState).length ? <div className="overflow-x-auto"><table><thead><tr><th>Field</th><th>Current</th><th>Target</th></tr></thead><tbody>{profileDiff(profile.knownState, profile.targetState).map((item) => <tr key={item.field}><td>{item.field}</td><td><pre className="whitespace-pre-wrap text-xs">{json(item.current)}</pre></td><td><pre className="whitespace-pre-wrap text-xs">{json(item.target)}</pre></td></tr>)}</tbody></table></div> : <p className="text-sm">No differences. Inspect the profile or update its target state first.</p>}</Panel>}
    <Panel title="Instructions and output">
      <p className="mb-4 text-sm text-muted-foreground">Review and edit these instructions before creating the mission. Operators receive this plan as structured data and ordinary page text.</p>
      <div className="space-y-4">
        <Field name="constraints" label="Constraints (JSON)"><textarea className="font-mono text-xs" id="constraints" name="constraints" rows={9} value={constraints} onChange={(event) => setConstraints(event.target.value)} required/></Field>
        <Field name="steps" label="Steps (JSON)" hint="Each step has title, instruction and requiresApproval."><textarea className="font-mono text-xs" id="steps" name="steps" rows={12} value={steps} onChange={(event) => setSteps(event.target.value)} required/></Field>
        <Field name="expectedResult" label="Expected output (JSON)"><textarea className="font-mono text-xs" id="expectedResult" name="expectedResult" rows={8} value={expectedResult} onChange={(event) => setExpectedResult(event.target.value)} required/></Field>
        <Field name="input" label="Additional input (JSON)" hint="Stored as mission context. Do not include credentials or unrelated private data."><textarea className="font-mono text-xs" id="input" name="input" rows={3} defaultValue="{}"/></Field>
        <Field name="status" label="Initial status"><select id="status" name="status" defaultValue="READY"><option value="READY">Ready</option><option value="DRAFT">Draft</option></select></Field>
      </div>
    </Panel>
    <Button type="submit">Create mission</Button>
  </ActionForm>;
}
