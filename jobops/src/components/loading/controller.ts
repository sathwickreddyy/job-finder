// Framework-free state for the app-wide loading popup. Progress is simulated, never measured.

export type LoadingSnapshot = {
  visible: boolean;
  label: string;
  progress: number;
  closing: boolean;
};

export const LOADING_TIMING = {
  showAfter: 200,
  minVisible: 450,
  fadeOut: 280,
  trickleEvery: 180,
  maxDuration: 15_000,
  start: 0.08,
  cap: 0.92,
  step: 0.1,
} as const;

export const HIDDEN: LoadingSnapshot = { visible: false, label: "", progress: 0, closing: false };

export type LoadingController = ReturnType<typeof createLoadingController>;

export function createLoadingController() {
  let snapshot = HIDDEN;
  let latest = 0;
  let active = 0;
  let navigation = 0;
  let shownAt = 0;
  let timeouts: ReturnType<typeof setTimeout>[] = [];
  let trickle: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();

  const emit = (next: LoadingSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const later = (ms: number, run: () => void) => {
    timeouts.push(setTimeout(run, ms));
  };
  const clearTimers = () => {
    timeouts.forEach(clearTimeout);
    timeouts = [];
    clearInterval(trickle);
    trickle = undefined;
  };
  const hide = () => {
    clearTimers();
    active = 0;
    shownAt = 0;
    emit(HIDDEN);
  };

  function start(label: string) {
    clearTimers();
    const task = ++latest;
    active = task;
    const visible = snapshot.visible;
    emit({ visible, label, progress: LOADING_TIMING.start, closing: false });
    if (!visible)
      later(LOADING_TIMING.showAfter, () => {
        shownAt = Date.now();
        emit({ ...snapshot, visible: true });
      });
    trickle = setInterval(() => {
      const { progress } = snapshot;
      emit({
        ...snapshot,
        progress: progress + (LOADING_TIMING.cap - progress) * LOADING_TIMING.step,
      });
    }, LOADING_TIMING.trickleEvery);
    later(LOADING_TIMING.maxDuration, hide);
    return task;
  }

  function finish(task: number) {
    if (!task || task !== active) return;
    clearTimers();
    active = 0;
    if (!snapshot.visible) return hide();
    const wait = Math.max(0, LOADING_TIMING.minVisible - (Date.now() - shownAt));
    later(wait, () => {
      emit({ ...snapshot, progress: 1, closing: true });
      later(LOADING_TIMING.fadeOut, hide);
    });
  }

  return {
    start,
    finish,
    /** Starts a page change; `arrived` finishes the most recent one. */
    navigate(label: string) {
      navigation = start(label);
      return navigation;
    },
    arrived() {
      finish(navigation);
    },
    reset: hide,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
  };
}
