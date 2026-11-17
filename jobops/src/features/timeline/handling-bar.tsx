"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronDown, Info } from "lucide-react";
import { outcomeMeta, type OutcomeId } from "@/features/applications/phase";
import type { MailItem } from "@/features/mail/mail-item";
import { linkMailOnly } from "@/features/mail/triage-actions";
import { handleMailAction } from "@/features/mail/workspace-actions";
import { cn } from "@/lib/utils";
import {
  choiceOptions,
  choiceValue,
  defaultChoice,
  planFor,
  type EmailChoice,
} from "./email-choice";
import { OutcomeFields, PlaceAt, Refusal, useSubmit, type PlaceOptions } from "./handling";
import type { Handling } from "./suggest";

const primary =
  "morph pressable inline-flex h-10 max-w-full items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary-hover hover:no-underline";
const quiet =
  "pressable inline-flex h-10 items-center gap-1 rounded-full px-3.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground";
const chip =
  "pressable inline-flex h-9 max-w-full items-center truncate rounded-full border border-border px-3.5 text-sm font-medium hover:bg-muted";

/**
 * Gallery buttons A, one question and one button: "This email is about" (a role, nothing, a
 * new opening or another company), then a single button whose words say what it will save,
 * with a sentence saying where it shows. The same bar runs on Mail, the company page and the
 * phone, over the same save actions the API uses, so every page stays in sync.
 */
export function HandlingBar({
  item,
  handling,
  placeOptions,
  infoLabel = "Mark as just info",
  returnTo,
  ask = true,
}: {
  item: MailItem;
  handling: Handling;
  placeOptions?: PlaceOptions;
  /** The just-info button's words, e.g. "Mark as handled" on the phone. */
  infoLabel?: string;
  /** A company page path: adding an email returns there with that application's row open. */
  returnTo?: string;
  /** False where the caller already asked which role (the company page tray). */
  ask?: boolean;
}) {
  const handle = useSubmit(handleMailAction);
  const link = useSubmit(linkMailOnly);
  const options = choiceOptions(item, handling, { canPlace: !!placeOptions });
  const [choice, setChoice] = useState<EmailChoice | null>(() => defaultChoice(item, handling));
  // undefined follows the suggestion; null means "no update, just add it".
  const [outcome, setOutcome] = useState<OutcomeId | null | undefined>(undefined);
  const [more, setMore] = useState(false);
  const plan = planFor(choice, handling, { outcome, infoLabel, linked: item.application?.id });
  const app =
    choice?.kind === "role"
      ? handling.applications.find((option) => option.id === choice.id)
      : undefined;
  const others = (app?.outcomes ?? []).filter(
    (id) => !(plan.action === "outcome" && plan.outcome === id),
  );
  const choose = (value: string) => {
    setChoice(options.find((option) => option.value === value)?.choice ?? null);
    setOutcome(undefined);
    setMore(false);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter?.getAttribute("name") !== "link") return handle.submit(event);
    // Adding returns to this page: the company row it belongs to, or wherever Mail was.
    const back = event.currentTarget.elements.namedItem("returnTo") as HTMLInputElement | null;
    if (back && !back.value) back.value = `${window.location.pathname}${window.location.search}`;
    link.submit(event);
  };
  const state = link.state.error ? link.state : handle.state;
  const pending = handle.pending || link.pending;
  return (
    <div className="border-t border-border pt-3">
      <form onSubmit={submit} aria-busy={pending} className="grid gap-3">
        <input type="hidden" name="id" value={item.id} />
        {app && (
          <>
            <input type="hidden" name="applicationId" value={app.id} />
            <input type="hidden" name="mailId" value={item.id} />
            <input type="hidden" name="recordId" value={app.id} />
            <input
              type="hidden"
              name="returnTo"
              value={returnTo ? `${returnTo}?open=${app.id}` : ""}
              readOnly
            />
          </>
        )}
        {ask && options.length > 1 && (
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">
            This email is about
            <select
              value={choiceValue(choice)}
              onChange={(event) => choose(event.target.value)}
              className="min-h-9! w-auto! max-w-full! min-w-0 py-1! font-normal text-foreground"
            >
              {!choice && <option value="">Choose…</option>}
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {plan.action === "outcome" && <OutcomeFields key={plan.outcome} outcome={plan.outcome} />}
        {plan.action !== "company" && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {plan.action === "none" ? (
              <button type="button" disabled className={cn(primary, "opacity-45")}>
                {plan.button}
              </button>
            ) : plan.action === "opening" ? (
              <Link href={`/jobs/new?fromMail=${item.id}`} className={primary}>
                {plan.button}
              </Link>
            ) : (
              <button
                type="submit"
                name={
                  plan.action === "outcome"
                    ? "outcome"
                    : plan.action === "link"
                      ? "link"
                      : "justInfo"
                }
                value={plan.action === "outcome" ? plan.outcome : "1"}
                className={primary}
              >
                <span className="truncate">{plan.button}</span>
              </button>
            )}
            {app && (others.length > 0 || plan.action === "outcome") && (
              <button
                type="button"
                aria-expanded={more}
                onClick={() => setMore(!more)}
                className={quiet}
              >
                Different update
                <ChevronDown
                  aria-hidden
                  size={16}
                  className={cn("transition-transform", more && "rotate-180")}
                />
              </button>
            )}
          </div>
        )}
        {more && app && (
          <div className="reveal flex flex-wrap gap-2">
            {others.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setOutcome(id);
                  setMore(false);
                }}
                className={chip}
              >
                {outcomeMeta[id].label}
              </button>
            ))}
            {plan.action === "outcome" && (
              <button
                type="button"
                onClick={() => {
                  setOutcome(null);
                  setMore(false);
                }}
                className={chip}
              >
                No update, just add it
              </button>
            )}
          </div>
        )}
      </form>
      {plan.action === "company" && placeOptions && (
        <PlaceAt item={item} options={placeOptions} bare />
      )}
      <p className="m-0 mt-2 flex items-start gap-2 text-xs text-muted-foreground">
        <Info aria-hidden size={14} className="mt-px shrink-0" />
        {plan.what}
      </p>
      <Refusal state={state} />
    </div>
  );
}
