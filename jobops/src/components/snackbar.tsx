"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleCheck } from "lucide-react";

export type Snack = { message: string; action?: { label: string; onClick: () => void } };

const SnackbarContext = createContext<{ show: (snack: Snack) => void }>({ show: () => {} });
const VISIBLE_MS = 6000;

/** One snack at a time, at app level so it outlives the view that showed it. */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [snack, setSnack] = useState<(Snack & { id: number }) | null>(null);
  const [paused, setPaused] = useState(false);
  const next = useRef(0);
  const show = useCallback((value: Snack) => {
    next.current++;
    setPaused(false);
    setSnack({ ...value, id: next.current });
  }, []);
  // A new snack restarts the timer; hovering or focusing it holds it open.
  useEffect(() => {
    if (!snack || paused) return;
    const timer = window.setTimeout(() => setSnack(null), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [snack, paused]);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {snack && (
          <SnackbarView
            key={snack.id}
            message={snack.message}
            action={
              snack.action && {
                label: snack.action.label,
                onClick: () => {
                  setSnack(null);
                  snack.action!.onClick();
                },
              }
            }
          />
        )}
      </div>
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  return useContext(SnackbarContext);
}

export function SnackbarView({ message, action }: Snack) {
  return (
    <div
      role="status"
      className="reveal pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl bg-foreground py-2 pr-2 pl-4 text-sm text-background shadow-surface"
    >
      <CircleCheck aria-hidden size={18} className="shrink-0" />
      <span className="min-w-0 py-1.5">{message}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="pressable h-9 shrink-0 rounded-full px-3 font-medium text-background hover:bg-background/15"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
