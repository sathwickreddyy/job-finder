"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function RecordPicker({
  mailId,
  outcome,
  records,
}: {
  mailId: string;
  outcome: string | null;
  records: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [recordId, setRecordId] = useState("");
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5">
      <label htmlFor={`pick-${mailId}`} className="sr-only">
        Record for this message
      </label>
      <select
        id={`pick-${mailId}`}
        value={recordId}
        onChange={(event) => setRecordId(event.target.value)}
        className="!min-h-8 flex-1 !py-1 text-sm"
      >
        <option value="">Choose a record</option>
        {records.map((record) => (
          <option key={record.id} value={record.id}>
            {record.label}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        className="h-8 rounded-full px-3"
        disabled={!recordId}
        onClick={() =>
          router.push(
            `/applications/${recordId}?mail=${mailId}${outcome ? `&outcome=${outcome}` : ""}#what-happened`,
          )
        }
      >
        Link and update
      </Button>
    </div>
  );
}
