import { describe, expect, it } from "vitest";
import { namedStepsOf } from "@/features/applications/named-steps";
import { timelineEntries } from "@/features/timeline/entries";
import type { MailItem } from "@/features/mail/mail-item";
import { at, event, NOW, record, round, uid } from "./lane-fixtures";

const mail = (id: string, receivedAt: Date): MailItem => ({
  id,
  account: "me@example.com",
  provider: "GMAIL",
  folders: ["INBOX"],
  receivedAt: receivedAt.toISOString(),
  sender: "recruiter@example.com",
  senderName: "Recruiter",
  subject: `Subject ${id}`,
  text: "Hello",
  company: { key: "oracle", name: "Oracle" },
  application: null,
  tag: "interviewCall",
  kind: "Interview",
  attention: "open",
  handledAt: null,
  outcome: null,
});

/** The DOM ids the timeline renders: a mail row, a step card and a round card. */
function renderedIds(input: Parameters<typeof timelineEntries>[0]) {
  return new Set(
    timelineEntries(input)
      .flatMap((day) => day.entries)
      .map((entry) =>
        entry.type === "mail"
          ? `mail-${entry.item.id}`
          : entry.type === "round"
            ? `round-${entry.round.id}`
            : `entry-${entry.id}`,
      ),
  );
}

describe("step targets", () => {
  it("every target a step links to is a row the timeline renders", () => {
    const id = uid();
    const r1 = round(id, {
      kind: "DSA",
      position: 1,
      outcome: "FAILED",
      scheduledAt: at("2026-09-30T11:00:00"),
    });
    const [ackMail, scheduledMail, rejectMail] = [uid(), uid(), uid()];
    const events = [
      event(id, "APPLICATION_SUBMITTED", at("2026-09-27T18:30:00")),
      event(id, "ACKNOWLEDGEMENT_RECEIVED", at("2026-09-28T10:00:00"), {
        payload: { mailMessageId: ackMail },
      }),
      event(id, "INTERVIEW_SCHEDULED", at("2026-09-29T10:00:00"), {
        payload: { roundId: r1.id, mailMessageId: scheduledMail },
      }),
      event(id, "ROUND_FAILED", at("2026-10-01T09:00:00"), {
        payload: { roundId: r1.id, mailMessageId: rejectMail },
      }),
    ];
    const steps = namedStepsOf(
      record({
        id,
        status: "REJECTED",
        phase: "Closed",
        closedReason: "REJECTED",
        events,
        rounds: [r1],
      }),
      NOW,
    );
    const ids = renderedIds({
      mail: [
        mail(rejectMail, at("2026-10-01T09:00:00")),
        mail(scheduledMail, at("2026-09-29T10:00:00")),
        mail(ackMail, at("2026-09-28T10:00:00")),
      ],
      events,
      rounds: [r1],
      complete: true,
      filtered: false,
      now: NOW,
    });
    const targets = steps.flatMap((step) => (step.target ? [step.target] : []));
    expect(targets.length).toBeGreaterThanOrEqual(4);
    for (const target of targets) expect(ids, target).toContain(target);
  });
});
