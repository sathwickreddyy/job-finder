import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { AiPendingBadge } from "./AiPendingBadge";
import { api } from "../../lib/api-client";

export function ManualJobDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const qc = useQueryClient();

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/jobs/manual", {
        body: { role, company, url, notes: notes || null },
      });
      if (error) {
        const e = error as { detail?: { msg?: string }[] };
        throw new Error(e.detail?.[0]?.msg || "add failed");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setRole("");
      setCompany("");
      setUrl("");
      setNotes("");
      onClose();
    },
  });

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Add manual job</h3>
        <AiPendingBadge pending={true} />
      </div>
      <p className="text-xs text-text-muted mb-4">
        AI-powered JD import from URL is pending. For now, fill in role + company + URL; we'll add it with the URL as the primary reference.
      </p>
      <div className="space-y-3">
        <Input placeholder="Role (required)" value={role} onChange={(e) => setRole(e.target.value)} />
        <Input placeholder="Company (required)" value={company} onChange={(e) => setCompany(e.target.value)} />
        <Input placeholder="URL (required)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Input placeholder="Notes — referral contact, recruiter name (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!role || !company || !url || add.isPending}
          onClick={() => add.mutate()}
        >
          {add.isPending ? "Adding…" : "Add"}
        </Button>
      </div>
    </Dialog>
  );
}
