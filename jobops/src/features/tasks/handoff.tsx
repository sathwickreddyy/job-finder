"use client";
import { useState, useTransition } from "react";
import { Copy, KeyRound } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { generateHandoff } from "./actions";

export function Handoff({
  id,
  title,
  assistant,
  goal,
  context,
  origin,
  apiEnabled,
}: {
  id: string;
  title: string;
  assistant: string;
  goal: string;
  context: string;
  origin: string;
  apiEnabled: boolean;
}) {
  const [credential, setCredential] = useState<{ token: string; expiresAt: string } | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const instructions = `Work with me on this JobOps task: ${title}\n\n${goal}\n\nMy preferences for this task:\n${context || "Discuss my preferences with me. Use the context you already have without guessing missing facts."}\n\nUse what you know about me, reconcile it with my confirmed JobOps details, and ask about conflicts. Focus on India. Return progress and proposals to JobOps. Do not apply, send messages or publish changes without an APPROVE decision on the exact latest proposal.\n\nTask: ${origin}/tasks/${id}\nAPI context: GET ${origin}/api/v1/tasks/${id}\n${credential ? `Authorization: Bearer ${credential.token}\nExpires: ${credential.expiresAt}\n` : "Ask me to generate task access if you need API access.\n"}API instructions: ${origin}/agent-guide\nIf you cannot reach my local app, give me the result to paste into the task. Do not claim you updated JobOps without a successful response.`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(instructions);
      setMessage("Handoff copied. Paste it into your chosen assistant session.");
    } catch {
      setMessage("Copy unavailable. Select and copy the instructions below.");
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Continue in {assistant}. Your existing conversation and memory can guide the work; this
        handoff adds the task and your chosen context.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={copy}>
          <Copy size={16} aria-hidden />
          Copy handoff
        </Button>
        {apiEnabled ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await generateHandoff(id);
                if (result.credential) {
                  setCredential(result.credential);
                  setMessage(
                    "Access prepared for seven days. Copy the updated handoff; previous credentials were revoked.",
                  );
                } else setMessage(result.error ?? "Could not prepare access.");
              })
            }
          >
            <KeyRound size={16} aria-hidden />
            {pending ? "Preparing…" : "Prepare agent API access"}
          </Button>
        ) : (
          <Link className="button-secondary" href="/settings#workspace-access">
            Set up agent API access
          </Link>
        )}
      </div>
      {message && (
        <p role="status" className="text-sm text-link">
          {message}
        </p>
      )}
      <details open={Boolean(credential)}>
        <summary className="text-sm text-muted-foreground">
          Handoff instructions{credential ? " · includes private task access" : ""}
        </summary>
        <label className="sr-only" htmlFor="handoff">
          Handoff instructions
        </label>
        <textarea
          id="handoff"
          readOnly
          rows={10}
          value={instructions}
          className="mt-3 font-mono text-xs"
        />
      </details>
      <p className="text-xs text-muted-foreground">
        A cloud browser may not reach localhost. Codex or Claude Code running on this machine can
        use the local API. Access is limited to this task and is never put in a link.
      </p>
    </div>
  );
}
