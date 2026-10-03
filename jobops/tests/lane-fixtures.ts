import type { LaneSource } from "@/features/applications/lanes";

export const NOW = new Date("2026-10-03T10:30:00+05:30");
export const at = (value: string) => new Date(`${value}+05:30`);
let sequence = 0;
export const uid = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;

export const record = (patch: Partial<LaneSource> = {}): LaneSource => ({
  id: uid(),
  jobId: uid(),
  company: "Oracle",
  companyKey: "oracle",
  companyName: "Oracle",
  role: "Senior Engineer",
  city: "Hyderabad",
  source: "DIRECT",
  status: "APPLIED",
  contact: null,
  sentAt: at("2026-10-02T18:30:00"),
  nextActionAt: null,
  nextActionNote: "",
  rounds: [],
  events: [],
  linkedMail: [],
  closedReason: null,
  phase: "Applied",
  typicalRounds: null,
  ...patch,
});

export function event(
  applicationId: string,
  eventType: string,
  occurredAt: Date,
  patch: { summary?: string; payload?: Record<string, unknown> } = {},
): LaneSource["events"][number] {
  return {
    id: uid(),
    applicationId,
    eventType,
    source: "MANUAL",
    summary: patch.summary ?? eventType,
    payload: patch.payload ?? {},
    confidence: null,
    occurredAt,
    createdAt: occurredAt,
  };
}

export function round(
  applicationId: string,
  patch: Partial<LaneSource["rounds"][number]> = {},
): LaneSource["rounds"][number] {
  return {
    id: uid(),
    applicationId,
    kind: "DSA",
    name: "",
    scheduledAt: null,
    outcome: "SCHEDULED",
    position: 1,
    notes: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}
