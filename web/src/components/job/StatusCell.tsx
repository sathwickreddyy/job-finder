import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Select } from "../ui/Select";
import { api } from "../../lib/api-client";
import { ALL_STATUSES, type ApplicationStatus } from "../../lib/constants";
import { InterviewSchedulePopover } from "./InterviewSchedulePopover";

export function StatusCell({
  jobId,
  value,
  nextInterviewAt,
}: {
  jobId: string;
  value: ApplicationStatus;
  nextInterviewAt: string | null;
}) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<ApplicationStatus>(value);
  const [pickerOpen, setPickerOpen] = useState(false);

  const patch = useMutation({
    mutationFn: async (body: {
      status: ApplicationStatus;
      next_interview_at?: string;
      interview_notes?: string;
    }) => {
      const { error } = await api.PATCH("/api/jobs/{job_id}/status", {
        params: { path: { job_id: jobId } },
        body,
      });
      if (error) throw new Error(error.detail?.[0]?.msg || "update failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  function onChange(next: ApplicationStatus) {
    setLocal(next);
    if (next === "Interviewing") {
      setPickerOpen(true);
    } else {
      patch.mutate({ status: next });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={local} onChange={(e) => onChange(e.target.value as ApplicationStatus)}>
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      {pickerOpen && (
        <InterviewSchedulePopover
          jobId={jobId}
          initial={nextInterviewAt}
          onSubmit={(next_interview_at, interview_notes) => {
            patch.mutate({
              status: "Interviewing",
              next_interview_at,
              interview_notes,
            });
            setPickerOpen(false);
          }}
          onCancel={() => {
            setPickerOpen(false);
            setLocal(value);
          }}
        />
      )}
    </div>
  );
}
