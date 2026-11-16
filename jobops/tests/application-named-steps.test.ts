import { describe, expect, it } from "vitest";
import { currentNamedStep, namedStepsOf } from "@/features/applications/named-steps";
import type { RoundKind } from "@/lib/round-kinds";
import { at, event, NOW, record, round, uid } from "./lane-fixtures";

const labels = (steps: ReturnType<typeof namedStepsOf>) => steps.map((step) => step.label);
const fullLoop: RoundKind[] = ["DSA", "LLD", "HLD", "HIRING_MANAGER"];

function interviewing(rounds: Parameters<typeof round>[1][], typicalLoop: RoundKind[] = fullLoop) {
  const id = uid();
  return record({
    id,
    status: "TECHNICAL_INTERVIEW",
    phase: "Interviewing",
    typicalLoop,
    events: [event(id, "ACKNOWLEDGEMENT_RECEIVED", at("2026-09-28T10:00:00"))],
    rounds: rounds.map((patch, index) => round(id, { position: index + 1, ...patch })),
  });
}

describe("namedStepsOf", () => {
  it("shows no expected rounds before the first round", () => {
    const steps = namedStepsOf(
      record({ status: "ACKNOWLEDGED", typicalLoop: ["DSA", "LLD"] }),
      NOW,
    );
    expect(labels(steps)).toEqual(["Applied", "Acknowledged", "Offer"]);
    expect(currentNamedStep(steps).label).toBe("Acknowledged");
    expect(steps[1].state).toBe("current");
  });

  it("names the booked round and the expected rounds from research", () => {
    const steps = namedStepsOf(
      interviewing([{ kind: "DSA", scheduledAt: at("2026-10-01T12:00:00") }]),
      NOW,
    );
    expect(labels(steps)).toEqual([
      "Applied",
      "Acknowledged",
      "Round 1 · DSA",
      "Round 2 · LLD",
      "Round 3 · HLD",
      "Managerial round",
      "Offer",
    ]);
    const dsa = steps[2];
    expect(dsa).toMatchObject({ state: "current", due: true });
    expect(dsa.detail).toMatch(/^Result due/);
    for (const step of steps.slice(3, 6))
      expect(step).toMatchObject({ state: "expected", detail: "Expected · from company research" });
    expect(steps.slice(0, 2).map((s) => s.state)).toEqual(["done", "done"]);
    expect(steps.at(-1)!.state).toBe("ahead");
    expect(currentNamedStep(steps).label).toBe("Round 1 · DSA");
  });

  it("shows when a future round is booked", () => {
    const steps = namedStepsOf(
      interviewing([{ kind: "DSA", scheduledAt: at("2026-10-20T15:00:00") }]),
      NOW,
    );
    expect(steps[2].detail).toBe("Booked 20 Oct, 3:00 pm");
    expect(steps[2].due).toBeUndefined();
  });

  it("marks passed rounds done and names people rounds", () => {
    const steps = namedStepsOf(
      interviewing([
        { kind: "DSA", outcome: "PASSED", scheduledAt: at("2026-09-30T11:00:00") },
        { kind: "HR", scheduledAt: at("2026-10-05T11:00:00") },
      ]),
      NOW,
    );
    expect(steps[2]).toMatchObject({ label: "Round 1 · DSA", state: "done" });
    expect(steps[3]).toMatchObject({ label: "HR round", state: "current" });
    expect(labels(steps).slice(4)).toEqual(["Round 2 · HLD", "Managerial round", "Offer"]);
  });

  it("skips cancelled rounds", () => {
    const steps = namedStepsOf(
      interviewing([
        { kind: "DSA", outcome: "CANCELLED" },
        { kind: "LLD", scheduledAt: at("2026-10-20T15:00:00") },
      ]),
      NOW,
    );
    expect(labels(steps).slice(0, 4)).toEqual([
      "Applied",
      "Acknowledged",
      "Round 1 · LLD",
      "Round 2 · LLD",
    ]);
  });

  it("stops at a failed round when rejected and fades the rest", () => {
    const failed = interviewing([
      { kind: "DSA", outcome: "FAILED", scheduledAt: at("2026-09-30T11:00:00") },
    ]);
    const steps = namedStepsOf(
      {
        ...failed,
        phase: "Closed",
        status: "REJECTED",
        closedReason: "REJECTED",
        events: [...failed.events, event(failed.id, "ROUND_FAILED", at("2026-10-01T09:00:00"))],
      },
      NOW,
    );
    const stopped = steps.find((s) => s.state === "stopped")!;
    expect(stopped).toMatchObject({ label: "Rejected", tone: "bad", key: steps[2].key });
    expect(steps.slice(3).every((s) => s.state === "faded")).toBe(true);
    expect(steps.some((s) => s.state === "expected")).toBe(false);
  });

  it("shows no expected steps without research", () => {
    const steps = namedStepsOf(
      interviewing([{ kind: "DSA", scheduledAt: at("2026-10-20T15:00:00") }], []),
      NOW,
    );
    expect(steps.some((s) => s.state === "expected")).toBe(false);
  });

  it("shows no expected steps once recorded rounds pass the research loop", () => {
    const steps = namedStepsOf(
      interviewing(
        [
          { kind: "DSA", outcome: "PASSED", scheduledAt: at("2026-09-30T11:00:00") },
          { kind: "LLD", scheduledAt: at("2026-10-20T15:00:00") },
        ],
        ["DSA"],
      ),
      NOW,
    );
    expect(labels(steps)).toEqual([
      "Applied",
      "Acknowledged",
      "Round 1 · DSA",
      "Round 2 · LLD",
      "Offer",
    ]);
  });

  it("keeps outreach steps", () => {
    const steps = namedStepsOf(record({ source: "REFERRAL", status: "APPLIED" }), NOW);
    expect(labels(steps)).toEqual(["Sent", "Replied", "Referred"]);
    expect(steps[0].state).toBe("done");
    expect(steps[1].state).toBe("ahead");
  });
});
