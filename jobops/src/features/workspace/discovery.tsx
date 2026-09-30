"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PromptPanel } from "@/components/prompt-panel";
import { Button } from "@/components/ui/button";
import { searchPrompt } from "./prompts";
export function Discovery({
  role: savedRole,
  location: savedLocation,
  context: savedContext,
}: {
  role: string;
  location: string;
  context: string;
}) {
  const [role, setRole] = useState(savedRole),
    [location, setLocation] = useState(savedLocation),
    [context, setContext] = useState(savedContext);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Find openings</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Copy the prompt, paste it into ChatGPT or Claude, then choose a role.
        </p>
      </div>
      <PromptPanel prompt={searchPrompt(role, location, context)} />
      <details className="rounded-card border border-border bg-card p-5">
        <summary className="cursor-pointer font-medium">
          Adjust role, location or preferences
        </summary>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            Role
            <input
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="Use what my assistant knows about me"
            />
          </label>
          <label className="space-y-2">
            Location
            <input value={location} onChange={(event) => setLocation(event.target.value)} />
          </label>
          <label className="space-y-2 sm:col-span-2">
            My preferences
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Paste context from an existing conversation, or leave blank."
            />
          </label>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          These changes customize this prompt. Save lasting preferences in{" "}
          <Link href="/my-profile#preferences" className="text-link">
            My sites & profile
          </Link>
          . Changing a field refreshes the prompt and replaces direct prompt edits.
        </p>
      </details>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-card p-6">
        <div>
          <h2 className="font-semibold">Found a role you like?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bring the link and full job description back here.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/jobs/new">
            Save a job description
            <ArrowRight size={16} aria-hidden />
          </Link>
        </Button>
      </div>
      <Link href="/jobs" className="inline-block text-sm text-link">
        View your saved openings
      </Link>
    </div>
  );
}
