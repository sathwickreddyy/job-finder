import { describe, expect, it } from "vitest";
import { resolveLanesView } from "@/features/applications/navigation";

const id = "00000000-0000-4000-8000-000000000001";

describe("lanes view", () => {
  it("opens a lane only for a record id and keeps mail and outcome with it", () => {
    expect(resolveLanesView({ open: id, mail: "m", outcome: "oa" })).toEqual({
      open: id,
      mail: "m",
      outcome: "oa",
      emails: false,
      notice: undefined,
    });
    expect(resolveLanesView({ open: "../../etc", mail: "m", outcome: "oa" })).toMatchObject({
      open: null,
      mail: null,
      outcome: undefined,
    });
  });

  it("opens the drawer for ?emails=1 and the old ?tab=emails link, ignoring other old tabs", () => {
    expect(resolveLanesView({ emails: "1" }).emails).toBe(true);
    expect(resolveLanesView({ tab: "emails" }).emails).toBe(true);
    expect(resolveLanesView({ tab: "records" })).toEqual({
      open: null,
      mail: null,
      outcome: undefined,
      emails: false,
      notice: undefined,
    });
  });

  it("clips notices to 300 characters", () => {
    expect(resolveLanesView({ notice: "x".repeat(400) }).notice).toHaveLength(300);
  });
});
