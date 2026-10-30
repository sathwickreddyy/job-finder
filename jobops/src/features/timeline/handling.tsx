"use client";

import {
  startTransition,
  useActionState,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Check, ChevronDown, Star, Undo2 } from "lucide-react";
import { useLoadingTask } from "@/components/loading/overlay";
import { outcomeMeta, type OutcomeId } from "@/features/applications/phase";
import { roundKindLabel } from "@/features/companies/metrics";
import type { MailItem } from "@/features/mail/mail-item";
import {
  handleMailAction,
  placeMailAction,
  reopenMailAction,
} from "@/features/mail/workspace-actions";
import type { ActionState } from "@/lib/actions";
import { roundKinds } from "@/lib/round-kinds";
import { cn } from "@/lib/utils";
import { suggestionFor, type Handling } from "./suggest";

export type PlaceOptions = {
  companies: { key: string; name: string }[];
  applications: { id: string; label: string }[];
};

const chip =
  "pressable inline-flex h-9 max-w-full items-center gap-1.5 truncate rounded-full px-3.5 text-sm font-medium";
const plainChip = "border border-border text-foreground hover:bg-muted";
const quiet =
  "pressable inline-flex h-11 items-center gap-1 rounded-full px-4 text-sm font-medium hover:bg-muted";

/** Submits like ActionForm: typed values survive a refusal instead of React's form reset. */
function useSubmit(action: (state: ActionState, data: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState(action, {});
  useLoadingTask(pending, "Saving");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(data));
  };
  return { state, pending, submit };
}

function Refusal({ state }: { state: ActionState }) {
  return state.error ? (
    <p role="alert" className="m-0 mt-2 text-sm text-destructive">
      {state.error}
    </p>
  ) : null;
}

/** Round, deadline or time for the outcomes that need one, in India time. */
function OutcomeFields({ outcome, onCancel }: { outcome: OutcomeId; onCancel: () => void }) {
  const id = useId();
  const needs = outcomeMeta[outcome].needs;
  const field = "grid gap-1 text-xs text-muted-foreground";
  return (
    <div className="reveal mt-3 flex flex-wrap items-end gap-2 rounded-2xl bg-secondary p-3">
      <input type="hidden" name="outcome" value={outcome} />
      {needs === "round" && (
        <label className={field} htmlFor={`${id}-kind`}>
          Round
          <select id={`${id}-kind`} name="kind" defaultValue="DSA" className="min-h-9! w-32! py-1!">
            {roundKinds.map((kind) => (
              <option key={kind} value={kind}>
                {roundKindLabel[kind]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={field} htmlFor={`${id}-day`}>
        {needs === "deadline" ? "Due" : "Day"}
        <input
          id={`${id}-day`}
          name="day"
          type="date"
          required
          className="min-h-9! w-auto! py-1!"
        />
      </label>
      {needs !== "deadline" && (
        <label className={field} htmlFor={`${id}-time`}>
          Time
          <input
            id={`${id}-time`}
            name="time"
            type="time"
            required
            className="min-h-9! w-auto! py-1!"
          />
        </label>
      )}
      <button
        type="submit"
        className="morph pressable h-9 bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="pressable h-9 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted"
      >
        Cancel
      </button>
    </div>
  );
}

/** "Place at…": Needs a home mail, or mail that matched the wrong company. */
function PlaceAt({ item, options }: { item: MailItem; options: PlaceOptions }) {
  const id = useId();
  const { state, pending, submit } = useSubmit(placeMailAction);
  const [target, setTarget] = useState("");
  const [kind, value] = target.split(":");
  return (
    <details className="mt-2">
      <summary className="inline-flex h-9 cursor-pointer items-center rounded-full px-3 text-sm font-medium text-link hover:bg-muted">
        Place at…
      </summary>
      <form onSubmit={submit} aria-busy={pending} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={item.id} />
        {kind && <input type="hidden" name={kind} value={value} />}
        <label className="grid min-w-0 gap-1 text-xs text-muted-foreground" htmlFor={id}>
          Company or application
          <select
            id={id}
            required
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="min-h-9! max-w-full! py-1!"
          >
            <option value="">Choose one</option>
            <optgroup label="Companies">
              {options.companies.map((company) => (
                <option key={company.key} value={`company:${company.key}`}>
                  {company.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Applications">
              {options.applications.map((app) => (
                <option key={app.id} value={`application:${app.id}`}>
                  {app.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button
          type="submit"
          className="pressable h-9 rounded-full border border-border px-4 text-sm font-medium hover:bg-muted"
        >
          Place
        </button>
      </form>
      <Refusal state={state} />
    </details>
  );
}

/**
 * Gallery handling B: one button for the suggested outcome, the others behind "Something
 * else", Just info beside them. With several open roles it asks "Which role?" first.
 */
export function HandlingBar({
  item,
  handling,
  placeOptions,
}: {
  item: MailItem;
  handling: Handling;
  placeOptions?: PlaceOptions;
}) {
  const { state, pending, submit } = useSubmit(handleMailAction);
  const [chosen, setChosen] = useState(handling.chosen);
  const [more, setMore] = useState(false);
  const [form, setForm] = useState<OutcomeId | null>(null);
  const app = handling.applications.find((option) => option.id === chosen);
  const { suggested, reason } = suggestionFor(handling, chosen);
  const others = (app?.outcomes ?? []).filter((id) => id !== suggested);
  // The choice stays in view once made, so a misclick is visible before anything is recorded.
  const asking = handling.chosen === null && handling.applications.length > 1;
  const outcomeButton = (id: OutcomeId, className: string, children: ReactNode) =>
    outcomeMeta[id].needs ? (
      <button
        key={id}
        type="button"
        aria-expanded={form === id}
        onClick={() => setForm(form === id ? null : id)}
        className={className}
      >
        {children}
      </button>
    ) : (
      <button key={id} type="submit" name="outcome" value={id} className={className}>
        {children}
      </button>
    );
  return (
    <div className="border-t border-border pt-3">
      <form onSubmit={submit} aria-busy={pending}>
        <input type="hidden" name="id" value={item.id} />
        {app && <input type="hidden" name="applicationId" value={app.id} />}
        {asking && (
          <div role="radiogroup" aria-label="Which role?" className="mb-3">
            <p className="m-0 mb-2 text-sm font-medium text-muted-foreground">Which role?</p>
            <div className="flex flex-wrap gap-2">
              {handling.applications.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={chosen === option.id}
                  onClick={() => setChosen(option.id)}
                  className={cn(
                    chip,
                    chosen === option.id
                      ? "bg-selected text-selected-foreground ring-1 ring-primary/35"
                      : plainChip,
                  )}
                >
                  <span className="truncate">{option.role}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {suggested ? (
            outcomeButton(
              suggested,
              "morph pressable inline-flex h-11 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary-hover",
              <>
                <Star aria-hidden size={13} className="fill-current" />
                Record {outcomeMeta[suggested].label.toLowerCase()}
              </>,
            )
          ) : (
            <button
              type="submit"
              name="justInfo"
              value="1"
              className="morph pressable inline-flex h-11 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Just info
            </button>
          )}
          {others.length > 0 && (
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore(!more)}
              className={cn(quiet, "text-foreground")}
            >
              Something else
              <ChevronDown
                aria-hidden
                size={16}
                className={cn("transition-transform", more && "rotate-180")}
              />
            </button>
          )}
          {suggested && (
            <button
              type="submit"
              name="justInfo"
              value="1"
              className={cn(quiet, "font-normal text-muted-foreground")}
            >
              Just info
            </button>
          )}
        </div>
        <p className="m-0 mt-2 text-xs text-muted-foreground">
          {asking && !app ? "Choose the role this email is about." : reason}
        </p>
        {more && (
          <div className="reveal mt-3 flex flex-wrap gap-2">
            {others.map((id) =>
              outcomeButton(
                id,
                cn(chip, plainChip, form === id && "ring-2 ring-primary"),
                outcomeMeta[id].label,
              ),
            )}
          </div>
        )}
      </form>
      {form && app && (
        <form onSubmit={submit} aria-busy={pending}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="applicationId" value={app.id} />
          <OutcomeFields key={form} outcome={form} onCancel={() => setForm(null)} />
        </form>
      )}
      <Refusal state={state} />
      {item.tag === "opportunity" && !item.application && (
        <Link
          href={`/jobs/new?fromMail=${item.id}`}
          className="mt-2 inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-link hover:bg-muted hover:no-underline"
        >
          Save as opening
        </Link>
      )}
      {placeOptions && <PlaceAt item={item} options={placeOptions} />}
    </div>
  );
}

/** What was done with a handled email; only Just info can be undone here. */
export function HandledLine({ item, recorded }: { item: MailItem; recorded: string | null }) {
  const { state, pending, submit } = useSubmit(reopenMailAction);
  const outcome = recorded ?? (item.outcome ? outcomeMeta[item.outcome].label : null);
  return (
    <div>
      <form
        onSubmit={submit}
        aria-busy={pending}
        className="m-0 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      >
        <Check aria-hidden size={15} className="shrink-0 text-tag-offer" />
        <span className="min-w-0 break-words">
          {outcome ? `Recorded: ${outcome}` : "Marked as just info"}
        </span>
        {!outcome && (
          <>
            <input type="hidden" name="id" value={item.id} />
            <button
              type="submit"
              className="pressable inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-link hover:bg-selected"
            >
              <Undo2 aria-hidden size={13} />
              Undo
            </button>
          </>
        )}
      </form>
      <Refusal state={state} />
    </div>
  );
}
