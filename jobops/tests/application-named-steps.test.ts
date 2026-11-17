import { describe, expect, it } from "vitest";
import { currentNamedStep, namedStepsOf } from "@/features/applications/named-steps";
import { at, event, NOW, record, round, uid } from "./lane-fixtures";

const labels = (steps: ReturnType<typeof namedStepsOf>) => steps.map((step) => step.label);

function interviewing(rounds: Parameters<typeof round>[1][]) {
  const id = uid();
  return record({
    id,
    status: "TECHNICAL_INTERVIEW",
    phase: "Interviewing",
    events: [event(id, "ACKNOWLEDGEMENT_RECEIVED", at("2026-09-28T10:00:00"))],
    rounds: rounds.map((patch, index) => round(id, { position: index + 1, ...patch })),
  });
}

describe("namedStepsOf", () => {
  it("shows Applied, then Offer / Rejected, when nothing else happened", () => {
    expect(labels(namedStepsOf(record({ status: "APPLIED" }), NOW))).toEqual([
      "Applied",
      "Offer / Rejected",
    ]);
  });

  it("shows Acknowledged only once it happened, and never predicts rounds", () => {
    const steps = namedStepsOf(record({ status: "ACKNOWLEDGED" }), NOW);
    expect(labels(steps)).toEqual(["Applied", "Acknowledged", "Offer / Rejected"]);
    expect(currentNamedStep(steps).label).toBe("Acknowledged");
    expect(steps[1].state).toBe("current");
    expect(steps[2]).toMatchObject({ key: "final", state: "ahead", target: null });
  });

  it("targets the submission, and the acknowledgement mail when it is known", () => {
    const id = uid();
    const mailId = uid();
    const submitted = event(id, "APPLICATION_SUBMITTED", at("2026-10-02T18:30:00"));
    const ack = event(id, "ACKNOWLEDGEMENT_RECEIVED", at("2026-10-03T09:00:00"), {
      payload: { mailMessageId: mailId },
    });
    const steps = namedStepsOf(record({ id, events: [submitted, ack] }), NOW);
    expect(steps[0]).toMatchObject({ key: "applied", target: `entry-${submitted.id}` });
    expect(steps[1]).toMatchObject({ key: "acknowledged", target: `mail-${mailId}` });
  });

  it("has no target for an acknowledgement with no mail, since the timeline draws no card for it", () => {
    const id = uid();
    const ack = event(id, "ACKNOWLEDGEMENT_RECEIVED", at("2026-10-03T09:00:00"));
    const steps = namedStepsOf(record({ id, events: [ack] }), NOW);
    expect(steps[1].target).toBeNull();
  });

  it("targets the email an outcome was recorded from, not an entry the timeline folds away", () => {
    const id = uid();
    const r1 = round(id, { kind: "DSA", position: 1, scheduledAt: at("2026-11-16T12:00:00") });
    const mailIds = [uid(), uid(), uid()];
    const scheduled = event(id, "INTERVIEW_SCHEDULED", at("2026-11-11T17:39:00"), {
      payload: { roundId: r1.id, mailMessageId: mailIds[0] },
    });
    const offer = event(id, "OFFER_RECEIVED", at("2026-11-20T10:00:00"), {
      payload: { mailMessageId: mailIds[1] },
    });
    const steps = namedStepsOf(
      record({
        id,
        status: "OFFER",
        phase: "Interviewing",
        events: [scheduled, offer],
        rounds: [{ ...r1, outcome: "PASSED" }],
      }),
      NOW,
    );
    expect(steps.find((step) => step.key === `scheduled-${r1.id}`)?.target).toBe(
      `mail-${mailIds[0]}`,
    );
    expect(steps.find((step) => step.key === "final")?.target).toBe(`mail-${mailIds[1]}`);
    const rejection = event(id, "REJECTION_RECEIVED", at("2026-11-22T10:00:00"), {
      payload: { mailMessageId: mailIds[2] },
    });
    const closed = namedStepsOf(
      record({
        id,
        status: "REJECTED",
        phase: "Closed",
        closedReason: "REJECTED",
        events: [rejection],
      }),
      NOW,
    );
    expect(closed.at(-1)?.target).toBe(`mail-${mailIds[2]}`);
  });

  it("adds Interview scheduled before each round and never predicts", () => {
    const id = uid();
    const r1 = round(id, { kind: "DSA", position: 1, scheduledAt: at("2026-11-16T12:00:00") });
    const scheduled = event(id, "INTERVIEW_SCHEDULED", at("2026-11-11T17:39:00"), {
      payload: { roundId: r1.id },
    });
    const steps = namedStepsOf(
      record({
        id,
        status: "TECHNICAL_INTERVIEW",
        phase: "Interviewing",
        events: [event(id, "ACKNOWLEDGEMENT_RECEIVED", at("2026-11-04T08:17:00")), scheduled],
        rounds: [r1],
      }),
      NOW,
    );
    expect(labels(steps)).toEqual([
      "Applied",
      "Acknowledged",
      "Interview scheduled",
      "Round 1 · DSA",
      "Offer / Rejected",
    ]);
    expect(steps[2]).toMatchObject({
      key: `scheduled-${r1.id}`,
      state: "done",
      detail: "11 Nov · for 16 Nov",
      target: `entry-${scheduled.id}`,
    });
    expect(steps[3]).toMatchObject({
      key: `round-${r1.id}`,
      state: "current",
      target: `round-${r1.id}`,
    });
  });

  it("shows when a future round is booked and when its result is due", () => {
    const booked = namedStepsOf(
      interviewing([{ kind: "DSA", scheduledAt: at("2026-10-20T15:00:00") }]),
      NOW,
    );
    expect(booked[3].detail).toBe("Booked 20 Oct, 3:00 pm");
    expect(booked[3].due).toBeUndefined();
    const past = namedStepsOf(
      interviewing([{ kind: "DSA", scheduledAt: at("2026-10-01T12:00:00") }]),
      NOW,
    );
    expect(past[3]).toMatchObject({ state: "current", due: true });
    expect(past[3].detail).toMatch(/^Result due/);
  });

  it("names the OA step OA received", () => {
    const steps = namedStepsOf(
      interviewing([{ kind: "ONLINE_ASSESSMENT", scheduledAt: at("2026-10-20T15:00:00") }]),
      NOW,
    );
    expect(labels(steps).slice(2, 4)).toEqual(["OA received", expect.stringMatching(/^Round 1/)]);
  });

  it("reads Date not set for a round without a date", () => {
    const steps = namedStepsOf(interviewing([{ kind: "DSA", scheduledAt: null }]), NOW);
    expect(steps[3].detail).toBe("Date not set");
    expect(steps[2].detail).toMatch(/^\d+ \w+$/);
  });

  it("keeps one Interview scheduled step after a reschedule", () => {
    const id = uid();
    const r1 = round(id, { kind: "DSA", position: 1, scheduledAt: at("2026-11-18T12:00:00") });
    const steps = namedStepsOf(
      record({
        id,
        status: "TECHNICAL_INTERVIEW",
        phase: "Interviewing",
        events: [
          event(id, "INTERVIEW_SCHEDULED", at("2026-11-11T17:39:00"), {
            payload: { roundId: r1.id },
          }),
          event(id, "ROUND_RESCHEDULED", at("2026-11-13T10:00:00"), {
            payload: { roundId: r1.id },
          }),
        ],
        rounds: [r1],
      }),
      NOW,
    );
    const scheduled = steps.filter((step) => step.label === "Interview scheduled");
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].detail).toMatch(/for 18 Nov$/);
  });

  it("marks passed rounds done and names people rounds", () => {
    const steps = namedStepsOf(
      interviewing([
        { kind: "DSA", outcome: "PASSED", scheduledAt: at("2026-09-30T11:00:00") },
        { kind: "HR", scheduledAt: at("2026-10-05T11:00:00") },
      ]),
      NOW,
    );
    expect(steps[3]).toMatchObject({ label: "Round 1 · DSA", state: "done" });
    expect(steps[5]).toMatchObject({ label: "HR round", state: "current" });
    expect(labels(steps).at(-1)).toBe("Offer / Rejected");
  });

  it("skips cancelled rounds", () => {
    const steps = namedStepsOf(
      interviewing([
        { kind: "DSA", outcome: "CANCELLED" },
        { kind: "LLD", scheduledAt: at("2026-10-20T15:00:00") },
      ]),
      NOW,
    );
    expect(labels(steps)).toEqual([
      "Applied",
      "Acknowledged",
      "Interview scheduled",
      "Round 1 · LLD",
      "Offer / Rejected",
    ]);
  });

  it("ends at Rejected when a round fails", () => {
    const failed = interviewing([
      { kind: "DSA", outcome: "FAILED", scheduledAt: at("2026-09-30T11:00:00") },
    ]);
    const rejection = event(failed.id, "ROUND_FAILED", at("2026-10-01T09:00:00"));
    const steps = namedStepsOf(
      {
        ...failed,
        phase: "Closed",
        status: "REJECTED",
        closedReason: "REJECTED",
        events: [...failed.events, rejection],
      },
      NOW,
    );
    expect(steps[3].state).toBe("stopped");
    expect(currentNamedStep(steps).label).toBe("Rejected");
    expect(steps.at(-1)).toMatchObject({
      key: "final",
      label: "Rejected",
      tone: "bad",
      state: "stopped",
      detail: "1 Oct",
      target: `entry-${rejection.id}`,
    });
  });

  it("fades a still-open round once the application closes", () => {
    const open = interviewing([{ kind: "DSA", scheduledAt: at("2026-10-01T12:00:00") }]);
    const steps = namedStepsOf(
      { ...open, phase: "Closed", status: "REJECTED", closedReason: "REJECTED" },
      NOW,
    );
    expect(steps.some((step) => step.state === "current")).toBe(false);
    expect(steps[3]).toMatchObject({ state: "faded" });
    expect(steps[3].due).toBeUndefined();
    expect(currentNamedStep(steps).label).toBe("Rejected");
  });

  it("ends at Accepted or Declined with a settled offer", () => {
    for (const [closedReason, word] of [
      ["ACCEPTED", "Accepted"],
      ["DECLINED", "Declined"],
    ] as const) {
      const id = uid();
      const steps = namedStepsOf(
        record({
          id,
          phase: "Closed",
          status: "CLOSED",
          closedReason,
          events: [event(id, "OFFER_RECEIVED", at("2026-10-20T10:00:00"))],
        }),
        NOW,
      );
      expect(steps.at(-1)).toMatchObject({
        key: "final",
        label: word,
        state: "done",
        detail: `${word} · 20 Oct`,
      });
      expect(currentNamedStep(steps).label).toBe(word);
    }
  });

  it("names an open offer, a withdrawal and a plain close", () => {
    const id = uid();
    const open = namedStepsOf(
      record({
        id,
        phase: "Decision",
        status: "OFFER",
        events: [event(id, "OFFER_RECEIVED", at("2026-10-02T10:00:00"))],
      }),
      NOW,
    );
    expect(open.at(-1)).toMatchObject({ label: "Offer", state: "current" });
    const withdrew = namedStepsOf(
      record({ phase: "Closed", status: "WITHDRAWN", closedReason: "WITHDREW" }),
      NOW,
    );
    expect(withdrew.at(-1)).toMatchObject({ label: "Withdrew", state: "stopped", tone: "muted" });
    const noReply = namedStepsOf(
      record({ phase: "Closed", status: "CLOSED", closedReason: "NO_REPLY" }),
      NOW,
    );
    expect(noReply.at(-1)).toMatchObject({ label: "Closed", state: "stopped" });
  });

  it("starts an unsent application at Not sent", () => {
    const steps = namedStepsOf(
      record({ phase: "Preparing", status: "PREPARING", sentAt: null }),
      NOW,
    );
    expect(steps[0]).toMatchObject({ label: "Not sent", state: "current" });
    expect(steps.slice(1).map((s) => s.state)).toEqual(["ahead", "ahead"]);
  });

  it("keeps Not sent for a preparing application with linked mail", () => {
    const id = uid();
    const steps = namedStepsOf(
      record({
        id,
        phase: "Preparing",
        status: "PREPARING",
        sentAt: null,
        events: [event(id, "MAIL_LINKED", at("2026-10-01T10:00:00"))],
        linkedMail: [
          {
            id: uid(),
            subject: "Your application",
            classification: "APPLICATION_ACKNOWLEDGEMENT",
            receivedAt: at("2026-10-01T10:00:00"),
            attentionState: "DONE",
          },
        ],
      }),
      NOW,
    );
    expect(steps[0]).toMatchObject({ label: "Not sent", state: "current" });
  });

  it("keeps outreach steps", () => {
    const steps = namedStepsOf(record({ source: "REFERRAL", status: "APPLIED" }), NOW);
    expect(labels(steps)).toEqual(["Sent", "Replied", "Referred"]);
    expect(steps[0].state).toBe("done");
    expect(steps[1].state).toBe("ahead");
  });
});

describe("NamedSteps", () => {
  it("links reached steps with a target and renders the add slot before the outcome", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { NamedSteps } = await import("@/features/applications/views/named-steps");
    const id = uid();
    const submitted = event(id, "APPLICATION_SUBMITTED", at("2026-10-02T18:30:00"));
    const steps = namedStepsOf(record({ id, events: [submitted] }), NOW);
    const html = renderToStaticMarkup(
      createElement(NamedSteps, {
        steps,
        size: "page",
        add: createElement("button", { type: "button" }, "Add"),
      }),
    );
    expect(html).toContain(`href="#entry-${submitted.id}"`);
    expect(html.indexOf("Add")).toBeGreaterThan(html.indexOf("Applied"));
    expect(html.indexOf("Add")).toBeLessThan(html.indexOf("Offer / Rejected"));
    expect(html.match(/<a /g)).toHaveLength(1);
    const closed = renderToStaticMarkup(
      createElement(NamedSteps, {
        size: "page",
        steps: [
          {
            key: "final",
            label: "Rejected",
            detail: "",
            state: "stopped",
            tone: "bad",
            target: "entry-x",
          },
        ],
      }),
    );
    expect(closed).toContain('href="#entry-x"');
  });
});
