"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, CalendarClock, Undo2 } from "lucide-react";
import { Button } from "@/components/ui";
import { TagPill } from "@/features/mail/tag-pill";
import { cn } from "@/lib/utils";
import { sampleApps, type SampleMail, type Tone } from "./data";
import { Monogram, StatusPill, clock, longDay } from "./parts";

const tessaract = sampleApps.find((app) => app.id === "tessaract")!;
const arcadia = sampleApps.find((app) => app.id === "arcadia")!;
const rejection = tessaract.story.find((item) => item.type === "mail") as SampleMail;
const invite = arcadia.story.find(
  (item) => item.type === "mail" && item.tag === "interviewCall",
) as SampleMail;

function Card({
  company,
  role,
  tone,
  label,
  children,
}: {
  company: string;
  role: string;
  tone: Tone;
  label: string;
  children: ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-3xl bg-card ring-1 ring-border">
      <header className="flex items-center gap-3 px-4 py-3.5">
        <Monogram name={company} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate font-semibold">{company}</p>
          <p className="m-0 truncate text-sm text-muted-foreground">{role}</p>
        </div>
        <StatusPill tone={tone} label={label} />
      </header>
      {children}
    </article>
  );
}

/** The email as it lands on the application: tag, when, subject. */
function EmailLine({ mail }: { mail: SampleMail }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
      <TagPill tag={mail.tag} />
      <span className="text-xs text-muted-foreground tabular-nums">
        {longDay(mail.at)}, {clock(mail.at)}
      </span>
      <span className="w-full truncate text-sm">{mail.subject}</span>
    </div>
  );
}

function Strip({ tone, children }: { tone: "ask" | "done" | "quiet"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "reveal flex flex-col gap-3 border-t border-border px-4 py-3.5 sm:flex-row sm:items-center",
        tone === "ask" && "bg-selected/45",
        tone === "done" && "bg-muted/35",
      )}
    >
      {children}
    </div>
  );
}

function Outcome({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <>
      <p className="m-0 min-w-0 flex-1 text-sm text-muted-foreground">{text}</p>
      <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full" onClick={onUndo}>
        <Undo2 aria-hidden size={14} />
        Undo
      </Button>
    </>
  );
}

/** A: the email asks once on its application; nothing changes until you press. */
export function AskOnce() {
  const [state, setState] = useState<"ask" | "rejected" | "elsewhere">("ask");
  const rejected = state === "rejected";
  return (
    <div className="space-y-3">
      <Card
        company={tessaract.company}
        role={tessaract.role}
        tone={rejected ? "rejected" : "applied"}
        label={rejected ? "Rejected" : "Applied"}
      >
        {state === "ask" && (
          <Strip tone="ask">
            <div className="min-w-0 flex-1">
              <EmailLine mail={rejection} />
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-full px-4"
                onClick={() => setState("rejected")}
              >
                Mark rejected
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-full px-4"
                onClick={() => setState("elsewhere")}
              >
                Not this application
              </Button>
            </div>
          </Strip>
        )}
        {rejected && (
          <Strip tone="done">
            <Outcome
              text="Rejected on Sat 31 Oct, from the email. Moved to Closed."
              onUndo={() => setState("ask")}
            />
          </Strip>
        )}
        {state === "elsewhere" && (
          <Strip tone="done">
            <Outcome
              text="The email moved to Needs a home on Mail. This application is unchanged."
              onUndo={() => setState("ask")}
            />
          </Strip>
        )}
      </Card>
      <p className="m-0 px-1 text-sm text-muted-foreground">
        Until you press, it counts in Needs you on Home, Applications and Mail.
      </p>
    </div>
  );
}

/** B: the email updates the application straight away; Undo puts it back. */
export function ApplyWithUndo() {
  const [applied, setApplied] = useState(true);
  return (
    <div className="space-y-3">
      <Card
        company={tessaract.company}
        role={tessaract.role}
        tone={applied ? "rejected" : "applied"}
        label={applied ? "Rejected" : "Applied"}
      >
        <Strip tone={applied ? "done" : "quiet"}>
          {applied ? (
            <>
              <div className="min-w-0 flex-1 space-y-1.5">
                <EmailLine mail={rejection} />
                <p className="m-0 text-xs text-muted-foreground">
                  Marked rejected from this email. Check it if the match looks wrong.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 rounded-full"
                onClick={() => setApplied(false)}
              >
                <Undo2 aria-hidden size={14} />
                Undo
              </Button>
            </>
          ) : (
            <>
              <p className="m-0 min-w-0 flex-1 text-sm text-muted-foreground">
                The email stays on this application&apos;s story but no longer changes its status.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 rounded-full px-3.5"
                onClick={() => setApplied(true)}
              >
                Mark rejected again
              </Button>
            </>
          )}
        </Strip>
      </Card>
      <p className="m-0 px-1 text-sm text-muted-foreground">
        Nothing waits for you. A wrong match is fixed by Undo here or by moving the email on Mail.
      </p>
    </div>
  );
}

/** C: final outcomes apply themselves; anything that needs a date or a round asks. */
export function ClearOnesApply() {
  const [rejected, setRejected] = useState(true);
  const [oa, setOa] = useState<"ask" | "added" | "info">("ask");
  const [due, setDue] = useState("2026-11-03");
  const dueLabel = longDay(`${due}T12:00:00+05:30`);
  return (
    <div className="space-y-3">
      <Card
        company={tessaract.company}
        role={tessaract.role}
        tone={rejected ? "rejected" : "applied"}
        label={rejected ? "Rejected" : "Applied"}
      >
        <Strip tone={rejected ? "done" : "quiet"}>
          {rejected ? (
            <>
              <div className="min-w-0 flex-1 space-y-1.5">
                <EmailLine mail={rejection} />
                <p className="m-0 text-xs text-muted-foreground">
                  Rejections and offers apply on their own.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 rounded-full"
                onClick={() => setRejected(false)}
              >
                <Undo2 aria-hidden size={14} />
                Undo
              </Button>
            </>
          ) : (
            <Outcome
              text="Back to Applied. The email stays on the story."
              onUndo={() => setRejected(true)}
            />
          )}
        </Strip>
      </Card>
      <Card
        company={arcadia.company}
        role={arcadia.role}
        tone={oa === "added" ? "interviewing" : "applied"}
        label={oa === "added" ? "Online assessment" : "Applied"}
      >
        {oa === "ask" && (
          <Strip tone="ask">
            <div className="min-w-0 flex-1">
              <EmailLine mail={invite} />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <label className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm ring-1 ring-border">
                <CalendarClock aria-hidden size={14} className="text-muted-foreground" />
                <span className="sr-only">Due</span>
                <input
                  type="date"
                  value={due}
                  onChange={(event) => setDue(event.target.value || due)}
                  className="w-[8.5rem] bg-transparent text-sm outline-none [color-scheme:light_dark]"
                />
              </label>
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-full px-4"
                onClick={() => setOa("added")}
              >
                Add assessment
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 rounded-full px-3"
                onClick={() => setOa("info")}
              >
                Just info
              </Button>
            </div>
          </Strip>
        )}
        {oa === "added" && (
          <Strip tone="done">
            <p className="m-0 flex min-w-0 flex-1 items-center gap-2 text-sm">
              <ArrowRight aria-hidden size={14} className="text-link" />
              Next: take the assessment by {dueLabel}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 rounded-full"
              onClick={() => setOa("ask")}
            >
              <Undo2 aria-hidden size={14} />
              Undo
            </Button>
          </Strip>
        )}
        {oa === "info" && (
          <Strip tone="done">
            <Outcome text="Kept on the story as information." onUndo={() => setOa("ask")} />
          </Strip>
        )}
      </Card>
      <p className="m-0 px-1 text-sm text-muted-foreground">
        Acknowledgements, rejections and offers apply on their own. Interview and assessment emails
        ask, because they need a date or a round.
      </p>
    </div>
  );
}
