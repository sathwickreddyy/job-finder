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
      <h3 className="text-lg font-semibold mb-4">Schedule interview</h3>
      <label className="block text-xs text-text-muted mb-1">Date & time</label>
      <Input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
      />
      <label className="block text-xs text-text-muted mb-1 mt-4">Notes (optional)</label>
      <Input
        placeholder="e.g. phone screen with Priya"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex justify-end gap-2 mt-5">
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
