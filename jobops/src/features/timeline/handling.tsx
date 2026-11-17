"use client";

import { startTransition, useActionState, useId, useState, type FormEvent } from "react";
import { Check, Undo2 } from "lucide-react";
import { useLoadingTask } from "@/components/loading/overlay";
import { outcomeMeta, type OutcomeId } from "@/features/applications/phase";
import { roundKindLabel } from "@/features/companies/metrics";
import type { MailItem } from "@/features/mail/mail-item";
import {
  placeMailAction,
  reopenMailAction,
  undoAutoOutcomeAction,
} from "@/features/mail/workspace-actions";
import type { ActionState } from "@/lib/actions";
import { roundKinds } from "@/lib/round-kinds";

export type PlaceOptions = {
  companies: { key: string; name: string }[];
  applications: { id: string; label: string }[];
};

/** Submits like ActionForm: typed values survive a refusal instead of React's form reset. */
export function useSubmit(action: (state: ActionState, data: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState(action, {});
  useLoadingTask(pending, "Saving");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(data));
  };
  return { state, pending, submit };
}

export function Refusal({ state }: { state: ActionState }) {
  return state.error ? (
    <p role="alert" className="m-0 mt-2 text-sm text-destructive">
      {state.error}
    </p>
  ) : null;
}

/** Round, deadline or time for the outcomes that need one, in India time. The form's button saves. */
export function OutcomeFields({ outcome }: { outcome: OutcomeId }) {
  const id = useId();
  const needs = outcomeMeta[outcome].needs;
  const field = "grid gap-1 text-xs text-muted-foreground";
  if (!needs) return null;
  return (
    <div className="reveal flex flex-wrap items-end gap-2">
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
    </div>
  );
}

/**
 * "Place at…": Needs a home mail, or mail that matched the wrong company. `bare` drops the
 * disclosure for the handling bar, which asks "A different company…" itself.
 */
export function PlaceAt({
  item,
  options,
  defaultOpen,
  bare,
}: {
  item: MailItem;
  options: PlaceOptions;
  defaultOpen?: boolean;
  bare?: boolean;
}) {
  const id = useId();
  const { state, pending, submit } = useSubmit(placeMailAction);
  const [target, setTarget] = useState("");
  const [kind, value] = target.split(":");
  const body = (
    <>
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
          className={
            bare
              ? "morph pressable inline-flex h-10 items-center bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
              : "pressable h-9 rounded-full border border-border px-4 text-sm font-medium hover:bg-muted"
          }
        >
          Move it
        </button>
      </form>
      <Refusal state={state} />
    </>
  );
  if (bare) return <div className="reveal">{body}</div>;
  return (
    <details className="mt-2" open={defaultOpen}>
      <summary className="inline-flex h-9 cursor-pointer items-center rounded-full px-3 text-sm font-medium text-link hover:bg-muted">
        Place at…
      </summary>
      {body}
    </details>
  );
}

/**
 * What was done with a handled email. Just info can be undone here, and so can an outcome the
 * mail rule recorded, while nothing newer was recorded on its application.
 */
export function HandledLine({ item, recorded }: { item: MailItem; recorded: string | null }) {
  if (item.autoOutcome) return <AutoOutcomeLine item={item} recorded={recorded} />;
  return <ManualLine item={item} recorded={recorded} />;
}

function AutoOutcomeLine({ item, recorded }: { item: MailItem; recorded: string | null }) {
  const { state, pending, submit } = useSubmit(undoAutoOutcomeAction);
  const outcome = recorded ?? (item.outcome ? outcomeMeta[item.outcome].label : "an outcome");
  if (item.autoOutcome?.undone)
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
        <Check aria-hidden size={15} className="shrink-0 text-tag-offer" />
        Undone. Kept on the application as information.
      </p>
    );
  return (
    <div>
      <form
        onSubmit={submit}
        aria-busy={pending}
        className="m-0 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      >
        <Check aria-hidden size={15} className="shrink-0 text-tag-offer" />
        <span className="min-w-0 break-words">Recorded from this email: {outcome}</span>
        {item.autoOutcome?.undoable && (
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

function ManualLine({ item, recorded }: { item: MailItem; recorded: string | null }) {
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
          {outcome
            ? `Recorded: ${outcome}`
            : item.copyOf
              ? `Same email as in ${item.copyOf.account}`
              : "Marked as just info"}
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
