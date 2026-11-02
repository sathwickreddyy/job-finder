import { afterEach, describe, expect, it, vi } from "vitest";
import { scoreFlowController } from "@/features/resumes/score/ui/flow";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const reviewed = {
  list: {
    terms: [{ term: "Java", aliases: [], importance: "required", jdQuote: "Java." }],
    fingerprint: "fp",
    reviewedAt: "2026-11-02T06:00:00Z",
    reviewedBy: "user",
  },
  description: "Java.",
};
type Step = { step: string; opening?: { snapshotId: string } };
function harness() {
  let state: Step = { step: "idle" };
  const steps: Step[] = [];
  const setState = (update: Step | ((s: Step) => Step)) => {
    state = typeof update === "function" ? update(state) : update;
    steps.push(state);
  };
  return { steps, setState, current: () => state };
}

afterEach(() => vi.unstubAllGlobals());

describe("score flow controller", () => {
  it("a pick cancelled while its terms load never starts the checks", async () => {
    let release: (r: Response) => void = () => undefined;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    vi.stubGlobal("fetch", fetch);
    const h = harness();
    const flow = scoreFlowController("v", h.setState as never);
    const started = flow.start({ snapshotId: "s1", company: "A", title: "T" });
    flow.cancel();
    release(json(reviewed));
    await started;
    expect(h.steps.some((s) => s.step === "running")).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("the latest pick wins when an earlier one answers late", async () => {
    const pending: ((r: Response) => void)[] = [];
    const fetch = vi.fn((url: string) =>
      url.includes("/score")
        ? new Promise<Response>(() => undefined)
        : new Promise<Response>((resolve) => pending.push(resolve)),
    );
    vi.stubGlobal("fetch", fetch);
    const h = harness();
    const flow = scoreFlowController("v", h.setState as never);
    const first = flow.start({ snapshotId: "s1", company: "A", title: "T" });
    const second = flow.start({ snapshotId: "s2", company: "B", title: "T" });
    pending[1](json(reviewed));
    await second;
    pending[0](json(reviewed));
    await first;
    expect(h.current()).toMatchObject({ step: "running", opening: { snapshotId: "s2" } });
  });
});
