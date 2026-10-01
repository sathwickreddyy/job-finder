"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, LoaderCircle, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type Feedback = "scale" | "ripple" | "morph";

const base =
  "relative isolate inline-flex min-h-11 items-center justify-center gap-2 overflow-hidden rounded-full border-0 px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
  // Material state layer: content colour at 8% on hover, 12% while pressed.
  "before:pointer-events-none before:absolute before:inset-0 before:bg-current before:opacity-0 before:transition-opacity hover:before:opacity-[0.08] active:before:opacity-[0.12]";
const tones = {
  primary: "bg-primary text-primary-foreground",
  tonal: "bg-selected text-selected-foreground",
  outline: "border border-solid border-border bg-transparent text-foreground",
  destructive: "bg-danger-action text-danger-action-foreground",
};
const feel: Record<Feedback, string> = {
  scale: "pressable",
  ripple: "",
  morph: "hg-morph",
};

function addRipple(event: React.PointerEvent<HTMLButtonElement>) {
  const button = event.currentTarget;
  const box = button.getBoundingClientRect();
  const size = Math.hypot(box.width, box.height) * 2;
  const ripple = document.createElement("span");
  ripple.className = "hg-ripple";
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - box.left - size / 2}px`;
  ripple.style.top = `${event.clientY - box.top - size / 2}px`;
  ripple.addEventListener("animationend", () => ripple.remove());
  button.appendChild(ripple);
}

function DemoButton({
  feedback,
  tone,
  children,
  onClick,
  disabled,
}: {
  feedback: Feedback;
  tone: keyof typeof tones;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onPointerDown={feedback === "ripple" ? addRipple : undefined}
      className={cn(base, tones[tone], feel[feedback], "disabled:cursor-wait")}
    >
      {children}
    </button>
  );
}

/** Shows the same click → working → done sequence a real save will use. */
function SaveDemo({ feedback }: { feedback: Feedback }) {
  const [phase, setPhase] = useState<"idle" | "saving" | "saved">("idle");
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  function save() {
    setPhase("saving");
    timers.current.push(
      window.setTimeout(() => setPhase("saved"), 1200),
      window.setTimeout(() => setPhase("idle"), 2800),
    );
  }
  return (
    <DemoButton feedback={feedback} tone="tonal" onClick={save} disabled={phase !== "idle"}>
      {phase === "saving" ? (
        <LoaderCircle size={16} className="animate-spin" aria-hidden />
      ) : phase === "saved" ? (
        <Check size={16} className="hg-pop" aria-hidden />
      ) : null}
      <span aria-live="polite">
        {phase === "saving" ? "Saving…" : phase === "saved" ? "Saved" : "Save job description"}
      </span>
    </DemoButton>
  );
}

export function ButtonDemo({ feedback }: { feedback: Feedback }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-panel border border-border bg-card p-6">
      <DemoButton feedback={feedback} tone="primary">
        <Search size={16} aria-hidden />
        Find openings
      </DemoButton>
      <SaveDemo feedback={feedback} />
      <DemoButton feedback={feedback} tone="outline">
        Open portfolio
        <ArrowUpRight size={16} aria-hidden />
      </DemoButton>
      <DemoButton feedback={feedback} tone="destructive">
        <Trash2 size={16} aria-hidden />
        Remove link
      </DemoButton>
    </div>
  );
}
