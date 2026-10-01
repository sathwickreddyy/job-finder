import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLoadingController, LOADING_TIMING } from "@/components/loading/controller";

describe("loading popup controller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("never shows for tasks that finish within 200 ms", () => {
    const loading = createLoadingController();
    let shown = false;
    loading.subscribe(() => (shown ||= loading.getSnapshot().visible));
    const task = loading.start("Opening Companies");
    vi.advanceTimersByTime(150);
    loading.finish(task);
    vi.advanceTimersByTime(2000);
    expect(shown).toBe(false);
    expect(loading.getSnapshot().visible).toBe(false);
  });

  it("appears at 200 ms with the task label", () => {
    const loading = createLoadingController();
    loading.start("Opening Companies");
    vi.advanceTimersByTime(LOADING_TIMING.showAfter - 1);
    expect(loading.getSnapshot().visible).toBe(false);
    vi.advanceTimersByTime(1);
    expect(loading.getSnapshot()).toMatchObject({ visible: true, label: "Opening Companies" });
  });

  it("stays at least 450 ms, completes to 100 % and then hides", () => {
    const loading = createLoadingController();
    const task = loading.start("Saving");
    vi.advanceTimersByTime(300);
    loading.finish(task);
    vi.advanceTimersByTime(349);
    expect(loading.getSnapshot()).toMatchObject({ visible: true, closing: false });
    vi.advanceTimersByTime(1);
    expect(loading.getSnapshot()).toMatchObject({ visible: true, closing: true, progress: 1 });
    vi.advanceTimersByTime(LOADING_TIMING.fadeOut);
    expect(loading.getSnapshot().visible).toBe(false);
  });

  it("trickles towards 92 % without reaching it", () => {
    const loading = createLoadingController();
    loading.start("Uploading resume");
    vi.advanceTimersByTime(14_000);
    const { progress } = loading.getSnapshot();
    expect(progress).toBeGreaterThan(0.9);
    expect(progress).toBeLessThanOrEqual(LOADING_TIMING.cap);
  });

  it("keeps the popup up when a new task replaces a visible one", () => {
    const loading = createLoadingController();
    const save = loading.start("Saving");
    vi.advanceTimersByTime(300);
    const open = loading.start("Opening Contacts");
    expect(loading.getSnapshot()).toMatchObject({ visible: true, label: "Opening Contacts" });
    loading.finish(save);
    vi.advanceTimersByTime(2000);
    expect(loading.getSnapshot().visible).toBe(true);
    loading.finish(open);
    vi.advanceTimersByTime(2000);
    expect(loading.getSnapshot().visible).toBe(false);
  });

  it("restarts cleanly when a task begins while the popup is closing", () => {
    const loading = createLoadingController();
    const save = loading.start("Saving");
    vi.advanceTimersByTime(300);
    loading.finish(save);
    vi.advanceTimersByTime(400);
    expect(loading.getSnapshot().closing).toBe(true);
    const task = loading.start("Opening Contacts");
    expect(loading.getSnapshot()).toMatchObject({
      visible: true,
      closing: false,
      label: "Opening Contacts",
    });
    loading.finish(task);
    vi.advanceTimersByTime(2000);
    expect(loading.getSnapshot().visible).toBe(false);
  });

  it("dismisses any task after 15 s so the page is never stuck", () => {
    const loading = createLoadingController();
    loading.start("Opening Companies");
    vi.advanceTimersByTime(LOADING_TIMING.maxDuration);
    expect(loading.getSnapshot().visible).toBe(false);
  });

  it("finishes only the latest navigation when the page arrives", () => {
    const loading = createLoadingController();
    loading.arrived();
    loading.navigate("Opening Jobs");
    loading.navigate("Opening Companies");
    vi.advanceTimersByTime(300);
    loading.arrived();
    vi.advanceTimersByTime(2000);
    expect(loading.getSnapshot().visible).toBe(false);
  });

  it("hides immediately on reset (back-forward cache restore)", () => {
    const loading = createLoadingController();
    loading.start("Searching");
    vi.advanceTimersByTime(300);
    loading.reset();
    expect(loading.getSnapshot().visible).toBe(false);
  });
});
