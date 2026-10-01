"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Load = { label: string; progress: number; visible: boolean; closing: boolean };
const SHOW_AFTER = 200;
const MIN_VISIBLE = 450;

/** Simulates a navigation: hidden for fast loads, trickles to 92%, completes on arrival. */
export function useSimulatedLoad() {
  const [load, setLoad] = useState<Load | null>(null);
  const timers = useRef<number[]>([]);
  const shownAt = useRef(0);
  const reset = () => {
    timers.current.forEach((timer) => {
      window.clearTimeout(timer);
      window.clearInterval(timer);
    });
    timers.current = [];
  };
  useEffect(() => reset, []);
  function start(label: string, duration: number) {
    reset();
    shownAt.current = 0;
    setLoad({ label, progress: 0.08, visible: false, closing: false });
    timers.current.push(
      window.setTimeout(() => {
        shownAt.current = performance.now();
        setLoad((value) => value && { ...value, visible: true });
      }, SHOW_AFTER),
      window.setInterval(
        () =>
          setLoad((value) =>
            value && !value.closing
              ? { ...value, progress: value.progress + (0.92 - value.progress) * 0.1 }
              : value,
          ),
        180,
      ),
      window.setTimeout(() => {
        reset();
        if (!shownAt.current) return setLoad(null);
        const wait = Math.max(0, MIN_VISIBLE - (performance.now() - shownAt.current));
        timers.current.push(
          window.setTimeout(() => {
            setLoad((value) => value && { ...value, progress: 1, closing: true });
            timers.current.push(window.setTimeout(() => setLoad(null), 280));
          }, wait),
        );
      }, duration),
    );
  }
  return { load, start };
}

function Mark() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary font-semibold text-primary-foreground">
      J
    </span>
  );
}

/** A. Dialog with a Material linear progress bar over a blurred page. */
export function LoaderDialog({ load }: { load: Load | null }) {
  if (!load?.visible) return null;
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 grid place-items-center bg-scrim backdrop-blur-md",
        load.closing ? "hg-fade-out" : "hg-fade",
      )}
    >
      <div
        role="status"
        aria-live="polite"
        className="hg-pop w-[min(360px,calc(100vw-32px))] rounded-panel border border-border bg-popover p-6 shadow-surface"
      >
        <div className="flex items-center gap-3">
          <Mark />
          <p className="m-0 font-semibold">{load.label}</p>
        </div>
        <div
          role="progressbar"
          aria-label={load.label}
          className="mt-5 h-1 overflow-hidden rounded-full bg-selected"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${load.progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function WavyBar({ progress }: { progress: number }) {
  const clip = useId();
  const width = 300;
  const filled = progress * width;
  const wave = Array.from({ length: 17 }, () => "q5 -4 10 0 t10 0").join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} 12`}
      className="block w-full overflow-visible text-primary"
      role="progressbar"
      aria-label="Loading"
    >
      <clipPath id={clip}>
        <rect x="0" y="0" height="12" width={filled} className="transition-[width] duration-200" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <path
          d={`M-20 6 ${wave}`}
          className="hg-wave"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      {filled < width - 8 && (
        <>
          <line
            x1={filled + 8}
            x2={width - 2}
            y1="6"
            y2="6"
            className="stroke-selected"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx={width - 2} cy="6" r="2" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/** B. Same dialog with the Material 3 Expressive wavy progress indicator. */
export function LoaderWavy({ load }: { load: Load | null }) {
  if (!load?.visible) return null;
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 grid place-items-center bg-scrim backdrop-blur-md",
        load.closing ? "hg-fade-out" : "hg-fade",
      )}
    >
      <div
        role="status"
        aria-live="polite"
        className="hg-pop w-[min(380px,calc(100vw-32px))] rounded-panel border border-border bg-popover px-6 pb-7 pt-6 shadow-surface"
      >
        <div className="flex items-center gap-3">
          <Mark />
          <p className="m-0 font-semibold">{load.label}</p>
        </div>
        <div className="mt-6">
          <WavyBar progress={load.progress} />
        </div>
      </div>
    </div>
  );
}

/** C. Lighter: a progress edge across the top, light blur and a status pill. */
export function LoaderEdge({ load }: { load: Load | null }) {
  if (!load?.visible) return null;
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-scrim/40 backdrop-blur-[3px]",
        load.closing ? "hg-fade-out" : "hg-fade",
      )}
    >
      <div
        className="absolute inset-x-0 top-0 h-[3px] origin-left bg-primary transition-transform duration-200 ease-out"
        style={{ transform: `scaleX(${load.progress})` }}
      />
      <div
        role="status"
        aria-live="polite"
        className="hg-rise absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-popover py-2.5 pl-3 pr-5 text-sm font-medium shadow-surface"
      >
        <LoaderCircle size={18} className="animate-spin text-primary" aria-hidden />
        {load.label}
      </div>
    </div>
  );
}

export const loaderDemos = [
  { label: "Opening Companies", button: "Open a page", duration: 1600 },
  { label: "Uploading resume", button: "Upload a resume", duration: 4200 },
  { label: "Opening Home", button: "Fast page (no popup)", duration: 120 },
];
