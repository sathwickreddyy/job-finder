import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { AiPendingBadge } from "./AiPendingBadge";
import { api, apiErrorMessage } from "../../lib/api-client";

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
      if (error) throw new Error(apiErrorMessage(error, "add failed"));
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Add manual job</h3>
          <p className="mt-1 text-xs text-text-muted">
            Capture recruiter DMs, LinkedIn posts, and one-off referrals.
          </p>
        </div>
        <AiPendingBadge pending={true} />
      </div>
      <p className="mb-4 rounded-2xl border border-accent-amber/30 bg-accent-amber/10 p-3 text-xs leading-5 text-accent-amber">
        AI-powered JD import from URL is pending. For now, fill in role + company + URL; we'll add it with the URL as the primary reference.
      </p>
      <div className="grid gap-3">
        <Input
          placeholder="Role (required)"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
        <Input
          placeholder="Company (required)"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <Input
          placeholder="URL (required)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Input
          placeholder="Notes — referral contact, recruiter name (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="mt-5 flex justify-end gap-2">
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
