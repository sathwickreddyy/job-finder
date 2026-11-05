import { cn } from "@/lib/utils";
import { NAUKRI_WINDOW_DAYS, type NaukriStatus, type NaukriTone } from "./naukri-status";

const chipTones: Record<NaukriTone, { chip: string; dot: string }> = {
  fresh: { chip: "bg-tag-offer-container text-tag-offer", dot: "bg-tag-offer" },
  due: {
    chip: "bg-tag-interview-call-container text-tag-interview-call",
    dot: "bg-tag-interview-call",
  },
  late: { chip: "bg-tag-rejection-container text-tag-rejection", dot: "bg-tag-rejection" },
  none: { chip: "border border-border text-muted-foreground", dot: "bg-muted-foreground" },
};

/** Gallery pick A: one pill whose colour carries how long ago the profile was updated. */
export function NaukriChip({ status }: { status: NaukriStatus }) {
  const tone = chipTones[status.tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tone.chip,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
      {status.chip}
    </span>
  );
}

/** Gallery pick B: the last fourteen days, oldest first, with today outlined on the right. */
export function NaukriStrip({ status }: { status: NaukriStatus }) {
  return (
    <div
      role="img"
      aria-label={`Profile updated on ${status.doneInWindow} of the last ${NAUKRI_WINDOW_DAYS} days`}
    >
      <div className="flex items-end gap-1" aria-hidden>
        {status.days.map((day, index) => {
          const today = index === status.days.length - 1;
          return (
            <div
              key={day.iso}
              className="flex flex-1 flex-col items-center gap-1"
              title={day.label}
            >
              <span
                className={cn(
                  "h-7 w-full rounded-sm",
                  day.updated ? "bg-tag-offer" : "border border-border",
                  today && !day.updated && "border-dashed border-foreground",
                  today && day.updated && "outline outline-2 outline-offset-2 outline-primary",
                )}
              />
              <span className="text-[10px] leading-none text-muted-foreground">{day.weekday}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Updated on <span className="font-medium text-foreground">{status.doneInWindow}</span> of the
        last {NAUKRI_WINDOW_DAYS} days
      </p>
    </div>
  );
}
