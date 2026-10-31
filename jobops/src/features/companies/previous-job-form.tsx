"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPreviousJobAction } from "./actions";

export const savedText = (linked: number) =>
  linked ? `Saved. Linked ${linked} ${linked === 1 ? "email" : "emails"}.` : "Saved.";

/**
 * Add previous job (on a company page) or Add a previous employer (on Companies, which also
 * asks for the company). Role and joined month are required; nothing is pre-filled.
 */
export function PreviousJobForm({ company }: { company?: { key: string; name: string } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  return (
    <form
      className="grid max-w-md gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const text = (name: string) => String(form.get(name) ?? "").trim();
        startTransition(async () => {
          const result = await addPreviousJobAction({
            company: company?.name ?? text("company"),
            role: text("role"),
            joinedOn: text("joinedOn"),
            ...(text("leftOn") ? { leftOn: text("leftOn") } : {}),
            ...(text("notes") ? { notes: text("notes") } : {}),
            ...(company ? {} : { createCompany: true }),
          });
          if (result.error) setMessage({ text: result.error, error: true });
          else {
            setMessage({ text: savedText(result.linked ?? 0), error: false });
            router.refresh();
          }
        });
      }}
    >
      {!company && (
        <label className="text-sm font-medium">
          Company
          <input name="company" required maxLength={300} className="mt-1.5" />
        </label>
      )}
      <label className="text-sm font-medium">
        Role title
        <input name="role" required maxLength={200} className="mt-1.5" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">
          Joined
          <input name="joinedOn" type="month" required className="mt-1.5" />
        </label>
        <label className="text-sm font-medium">
          Left <span className="font-normal text-muted-foreground">(optional)</span>
          <input name="leftOn" type="month" className="mt-1.5" />
        </label>
      </div>
      <label className="text-sm font-medium">
        Notes <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea name="notes" rows={2} maxLength={2000} className="mt-1.5" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="morph pressable inline-flex h-10 items-center bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : company ? "Add previous job" : "Add previous employer"}
        </button>
        {message && (
          <span
            role="status"
            className={message.error ? "text-sm text-destructive" : "text-sm text-success"}
          >
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
