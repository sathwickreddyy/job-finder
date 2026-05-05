import { useState } from "react";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";

export function InterviewSchedulePopover({
  jobId,
  initial,
  onSubmit,
  onCancel,
}: {
  jobId: string;
  initial: string | null;
  onSubmit: (nextAt: string, notes: string) => void;
  onCancel: () => void;
}) {
  const [when, setWhen] = useState(initial?.slice(0, 16) || "");
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={true} onClose={onCancel} className="max-w-md">
      <h3 className="mb-1 text-lg font-semibold">Schedule interview</h3>
      <p className="mb-5 text-xs text-text-muted">
        Store the exact next step so it appears on Dashboard and Tracker.
      </p>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-text-faint">
        Date & time
      </label>
      <Input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
      />
      <label className="mb-1 mt-4 block text-xs font-semibold uppercase tracking-widest text-text-faint">
        Notes
      </label>
      <Input
        placeholder="e.g. phone screen with Priya"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!when}
          onClick={() => onSubmit(new Date(when).toISOString(), notes)}
        >
          Save
        </Button>
      </div>
      <p className="text-text-faint text-xs mt-3">job: {jobId}</p>
    </Dialog>
  );
}
