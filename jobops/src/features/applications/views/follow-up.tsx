"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { CalendarClock } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { Confirmation, focusAfterClose } from "./outcome-chips";
import { setFollowUp } from "../record-actions";

export function FollowUp({
  recordId,
  day,
  label,
  note,
}: {
  recordId: string;
  day: string | null;
  label: string | null;
  note: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const toggle = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!open && confirmation) return focusAfterClose(toggle.current);
  }, [open, confirmation]);
  return (
    <div>
      {confirmation && <Confirmation message={confirmation} />}
      <Button
        ref={toggle}
        variant="outline"
        aria-expanded={open}
        onClick={() => {
          setConfirmation("");
          setOpen(!open);
        }}
      >
        <CalendarClock size={15} aria-hidden />
        {label ? `Follow up on ${label}` : "Set a follow-up"}
      </Button>
      {open && (
        <ActionForm
          action={setFollowUp}
          onSuccess={(message) => {
            setConfirmation(message);
            setOpen(false);
          }}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl bg-muted/50 p-4"
        >
          <input type="hidden" name="id" value={recordId} />
          <label className="max-w-full w-44 text-sm">
            Follow-up date
            <input className="mt-1" type="date" name="day" required defaultValue={day ?? ""} />
          </label>
          <label className="min-w-0 w-full sm:min-w-48 flex-1 text-sm">
            What to do
            <input
              className="mt-1"
              name="note"
              maxLength={300}
              defaultValue={note}
              placeholder="Check the portal for an update"
            />
          </label>
          <Button>Save follow-up</Button>
          {day && (
            <Button name="clear" value="1" variant="ghost" formNoValidate>
              Clear
            </Button>
          )}
        </ActionForm>
      )}
    </div>
  );
}
