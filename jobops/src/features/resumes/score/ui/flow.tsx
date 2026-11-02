"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { TOOL_SOURCES, type ToolSource } from "../../fit/tools";
import type { ScorableOpening } from "../openings";
import type { ReviewedTerm, TermList } from "../terms";
import { OpeningPicker } from "./opening-picker";
import { RunRows, type RunStatus } from "./run-rows";
import { ScoreButton } from "./score-button";
import { TermReview } from "./term-review";

type Opening = { snapshotId: string; company: string; title: string };
type Statuses = Record<ToolSource, RunStatus>;
type State =
  | { step: "idle"; error?: string }
  | { step: "picking"; openings: ScorableOpening[] | null; error?: string }
  | {
      step: "reviewing";
      opening: Opening;
      description: string;
      initial: ReviewedTerm[];
      busy?: boolean;
      error?: string;
    }
  | {
      step: "running";
      opening: Opening;
      description: string;
      terms: ReviewedTerm[];
      reviewedAt: Date;
      statuses: Statuses;
    };

class CallError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new CallError(body.error ?? "JobOps couldn't complete this request.", body.code);
  return body as T;
}

const allStatuses = (status: RunStatus) =>
  Object.fromEntries(TOOL_SOURCES.map((s) => [s, status])) as Statuses;

const termsUrl = (snapshotId: string) => `/api/v1/jobs/snapshots/${snapshotId}/terms`;

async function suggestions(snapshotId: string): Promise<ReviewedTerm[]> {
  const { terms } = await call<{ terms: { term: string; aliases: string[]; jdQuote: string }[] }>(
    `${termsUrl(snapshotId)}/suggest`,
    { method: "POST" },
  );
  // The service can't tell required from preferred; the user decides.
  return terms.map((t) => ({ ...t, importance: "preferred" as const }));
}

/** The flow's steps, outside React so each async step only sets state after it resolves. */
function controller(versionId: string, setState: Dispatch<SetStateAction<State>>) {
  async function runTool(opening: Opening, tool: ToolSource) {
    const set = (status: RunStatus) =>
      setState((s) =>
        s.step === "running" && s.opening.snapshotId === opening.snapshotId
          ? { ...s, statuses: { ...s.statuses, [tool]: status } }
          : s,
      );
    set({ state: "running" });
    try {
      const result = await call<{
        mine: { score: number | null };
        base: { score: number | null } | null;
        baseSkipped?: "no_text" | "no_base";
      }>(`/api/v1/resumes/${versionId}/score`, {
        method: "POST",
        body: JSON.stringify({ snapshotId: opening.snapshotId, tool }),
      });
      set({
        state: "done",
        score: result.mine.score,
        baseScore: result.base?.score ?? null,
        baseSkipped: result.baseSkipped,
      });
    } catch (error) {
      const e = error as CallError;
      if (e.code === "terms_stale") return reviewAgain(opening);
      set({ state: "error", message: e.message, code: e.code });
    }
  }

  function run(opening: Opening, description: string, terms: ReviewedTerm[], reviewedAt: Date) {
    setState({
      step: "running",
      opening,
      description,
      terms,
      reviewedAt,
      statuses: allStatuses({ state: "running" }),
    });
    for (const tool of TOOL_SOURCES) void runTool(opening, tool);
  }

  /** The saved description changed under the terms: keep those still quoted, add fresh ones. */
  async function reviewAgain(opening: Opening) {
    const { list, description } = await call<{ list: TermList | null; description: string }>(
      termsUrl(opening.snapshotId),
    );
    const kept = (list?.terms ?? []).filter((t) => description.includes(t.jdQuote));
    const fresh = (await suggestions(opening.snapshotId)).filter(
      (s) => !kept.some((k) => k.term.toLocaleLowerCase() === s.term.toLocaleLowerCase()),
    );
    setState({ step: "reviewing", opening, description, initial: [...kept, ...fresh] });
  }

  async function start(opening: Opening) {
    try {
      const { list, description } = await call<{ list: TermList | null; description: string }>(
        termsUrl(opening.snapshotId),
      );
      if (list) return run(opening, description, list.terms, new Date(list.reviewedAt));
      setState({
        step: "reviewing",
        opening,
        description,
        initial: await suggestions(opening.snapshotId),
      });
    } catch (error) {
      setState({ step: "idle", error: (error as Error).message });
    }
  }

  async function pick() {
    setState({ step: "picking", openings: null });
    try {
      const { openings } = await call<{ openings: ScorableOpening[] }>(
        `/api/v1/resumes/${versionId}/openings`,
      );
      setState((s) => (s.step === "picking" ? { step: "picking", openings } : s));
    } catch (error) {
      setState({ step: "picking", openings: null, error: (error as Error).message });
    }
  }

  async function confirm(state: Extract<State, { step: "reviewing" }>, terms: ReviewedTerm[]) {
    const { opening, description } = state;
    setState({ ...state, busy: true, error: undefined });
    try {
      await call(termsUrl(opening.snapshotId), { method: "PUT", body: JSON.stringify({ terms }) });
      run(opening, description, terms, new Date());
    } catch (error) {
      setState({ ...state, busy: false, error: (error as Error).message });
    }
  }

  return { runTool, start, pick, confirm };
}

/** Score this file against any saved opening: pick it, confirm its terms once, watch each check. */
export function ScoreFlow({
  versionId,
  tailored,
  textReady,
  rescore,
}: {
  versionId: string;
  tailored: boolean;
  textReady: boolean;
  rescore?: Opening;
}) {
  const [state, setState] = useState<State>({ step: "idle" });
  const flow = useMemo(() => controller(versionId, setState), [versionId]);
  const rescoreId = rescore?.snapshotId;

  useEffect(() => {
    if (!rescore) return;
    // A Re-score link starts once; drop the flag so a refresh doesn't run it again.
    const url = new URL(window.location.href);
    url.searchParams.delete("rescore");
    window.history.replaceState(null, "", url);
    void flow.start(rescore);
    // Keyed by the snapshot: a new object for the same Re-score must not start it twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rescoreId, flow]);

  return (
    <div className="space-y-3">
      <ScoreButton
        tailored={tailored}
        disabledReason={textReady ? undefined : "This file's text hasn't been extracted yet"}
        expanded={state.step === "picking"}
        onClick={() => (state.step === "picking" ? setState({ step: "idle" }) : void flow.pick())}
      />
      {state.step === "idle" && state.error && (
        <p className="m-0 px-1 text-xs text-danger-action">{state.error}</p>
      )}
      {state.step === "picking" && (
        <OpeningPicker
          openings={state.openings}
          error={state.error}
          onClose={() => setState({ step: "idle" })}
          onPick={(o) =>
            void flow.start({ snapshotId: o.snapshotId, company: o.company, title: o.title })
          }
        />
      )}
      {state.step === "reviewing" && (
        <TermReview
          key={state.opening.snapshotId}
          opening={state.opening}
          description={state.description}
          initial={state.initial}
          busy={state.busy}
          error={state.error}
          onConfirm={(terms) => void flow.confirm(state, terms)}
          onCancel={() => setState({ step: "idle" })}
        />
      )}
      {state.step === "running" && (
        <RunRows
          opening={state.opening}
          statuses={state.statuses}
          reviewedAt={state.reviewedAt}
          onRetry={(tool) => void flow.runTool(state.opening, tool)}
          onEditTerms={() =>
            setState({
              step: "reviewing",
              opening: state.opening,
              description: state.description,
              initial: state.terms,
            })
          }
          onDone={() =>
            window.location.assign(`/resumes?file=${versionId}&fitJob=${state.opening.snapshotId}`)
          }
        />
      )}
    </div>
  );
}
