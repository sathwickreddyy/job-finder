"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  FilePenLine,
  FolderGit2,
  MessageSquare,
  Plus,
  UserRound,
  X,
} from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button, Field } from "@/components/ui";
import { createTaskAction } from "./actions";
import { assistants, taskStarters } from "./catalog";
import type { taskOptions } from "./read";

export type TaskOptions = Awaited<ReturnType<typeof taskOptions>>;
export function TaskForm({
  options,
  kind = "CUSTOM",
  jobId = "",
  profileId = "",
}: {
  options: TaskOptions;
  kind?: string;
  jobId?: string;
  profileId?: string;
}) {
  const starter = taskStarters.find((s) => s.kind === kind);
  return (
    <ActionForm action={createTaskAction}>
      <input type="hidden" name="kind" value={starter?.kind ?? "CUSTOM"} />
      <Field
        name="title"
        label="Task name"
        required
        maxLength={180}
        defaultValue={starter?.title ?? ""}
        placeholder="What would you like to work on?"
      />
      <Field
        name="goal"
        label="What do you want your assistant to do?"
        hint="Edit freely. You can use your own instructions instead of the suggested starting point."
      >
        <textarea
          id="goal"
          name="goal"
          required
          minLength={10}
          maxLength={20000}
          rows={5}
          defaultValue={starter?.goal ?? ""}
          placeholder="Describe the outcome you want. Your assistant can work through the details with you."
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="assistant" label="Work with">
          <select id="assistant" name="assistant">
            {assistants.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field name="resumeVersionId" label="Resume">
          <select
            id="resumeVersionId"
            name="resumeVersionId"
            required={kind === "TAILOR" || kind === "APPLY"}
            defaultValue={options.resumes.length === 1 ? options.resumes[0].id : ""}
          >
            <option value="">
              {kind === "TAILOR" || kind === "APPLY" ? "Select your resume" : "No resume attached"}
            </option>
            {options.resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {!options.resumes.length && (kind === "TAILOR" || kind === "APPLY") && (
        <p className="text-sm text-muted-foreground">
          Add your original resume first.{" "}
          <Link className="text-link" href="/my-profile#resume">
            Open My profile →
          </Link>
        </p>
      )}
      <details
        open={Boolean(
          jobId ||
          profileId ||
          kind === "APPLY" ||
          kind === "TAILOR" ||
          kind === "PROFILE" ||
          kind === "SHOWCASE",
        )}
      >
        <summary className="text-sm text-muted-foreground">
          Attach an opportunity or profile
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field name="jobId" label="Opportunity">
            <select id="jobId" name="jobId" defaultValue={jobId} required={kind === "APPLY"}>
              <option value="">No saved opportunity yet</option>
              {options.jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.company} · {j.title}
                </option>
              ))}
            </select>
          </Field>
          <Field name="profileId" label="Profile or portfolio">
            <select id="profileId" name="profileId" defaultValue={profileId}>
              <option value="">No profile selected</option>
              {options.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </details>
      {!options.jobs.length && kind === "APPLY" && (
        <p className="text-sm text-muted-foreground">
          Save an opening before preparing its application.{" "}
          <Link className="text-link" href="/opportunities">
            Open Opportunities →
          </Link>
        </p>
      )}
      <details>
        <summary className="text-sm text-muted-foreground">Your preferences for this task</summary>
        <p className="my-3 text-xs text-muted-foreground">
          Use your saved context, edit it for this task, or leave it empty and discuss it with your
          assistant.
        </p>
        <label className="sr-only" htmlFor="context">
          Preferences for this task
        </label>
        <textarea
          id="context"
          name="context"
          rows={5}
          maxLength={20000}
          defaultValue={options.context}
          placeholder="What matters to you, the work you enjoy, your strengths, and how you like to collaborate…"
        />
      </details>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Create the task, then copy the handoff to your assistant. You review submissions, messages,
        and profile changes before they happen.
      </p>
      <Button type="submit">
        Create task <ArrowRight size={16} aria-hidden />
      </Button>
    </ActionForm>
  );
}
const glyphs = {
  FIND: BriefcaseBusiness,
  TAILOR: FilePenLine,
  PROFILE: UserRound,
  APPLY: ArrowRight,
  OUTREACH: MessageSquare,
  SHOWCASE: FolderGit2,
};
export function TaskLauncher({ options }: { options: TaskOptions }) {
  const [kind, setKind] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (kind) dialog.current?.showModal();
  }, [kind]);
  return (
    <>
      <div className="mt-7 grid gap-3">
        {taskStarters.map((starter) => {
          const Icon = glyphs[starter.kind];
          return (
            <button
              key={starter.kind}
              onClick={() => setKind(starter.kind)}
              className="glass group flex w-full items-center gap-4 rounded-card border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-selected"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-selected text-link">
                <Icon size={21} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm font-semibold">{starter.title}</strong>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {starter.description}
                </span>
              </span>
              <ArrowRight
                size={17}
                className="text-muted-foreground group-hover:text-link"
                aria-hidden
              />
            </button>
          );
        })}
      </div>
      <button
        onClick={() => setKind("CUSTOM")}
        className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-link"
      >
        <Plus size={17} aria-hidden />
        Start with your own goal
      </button>
      <dialog
        ref={dialog}
        onClose={() => setKind(null)}
        className="fixed inset-y-0 right-0 left-auto m-3 max-h-[calc(100dvh-1.5rem)] w-[min(36rem,calc(100vw-1.5rem))] overflow-y-auto rounded-panel border border-border bg-popover p-6 text-foreground shadow-surface backdrop:bg-scrim"
        aria-labelledby="task-dialog-title"
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id="task-dialog-title" className="m-0 text-xl">
            {taskStarters.find((s) => s.kind === kind)?.title ?? "Your own goal"}
          </h2>
          <button
            aria-label="Close task"
            className="flex size-11 items-center justify-center rounded-xl hover:bg-muted"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {kind && <TaskForm key={kind} options={options} kind={kind} />}
      </dialog>
    </>
  );
}
