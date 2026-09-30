"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function LiveTasks({ reviewKeys }: { reviewKeys: string[] }) {
  const router = useRouter();
  const previous = useRef(new Set(reviewKeys));
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [router]);
  useEffect(() => {
    if (reviewKeys.some((key) => !previous.current.has(key))) {
      if ("Notification" in window && Notification.permission === "granted")
        new Notification("JobOps: your review is needed", {
          body: "An assistant has returned work or a question. Open Home to review it.",
        });
    }
    previous.current = new Set(reviewKeys);
  }, [reviewKeys]);
  return (
    <div className="mt-3 text-xs text-muted-foreground">
      <button
        type="button"
        className="min-h-9 text-link"
        onClick={async () => {
          if (!("Notification" in window)) {
            setMessage("Browser alerts are unavailable here. Review requests remain on Home.");
            return;
          }
          const result = await Notification.requestPermission();
          setMessage(
            result === "granted"
              ? "Browser alerts enabled. Home and task pages check for updates while visible."
              : "Review requests remain visible on Home.",
          );
        }}
      >
        Enable browser alerts
      </button>
      <p role="status">{message || (reviewKeys.length ? "Work is ready for your review." : "")}</p>
    </div>
  );
}
