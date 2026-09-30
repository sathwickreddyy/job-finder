import { eq } from "drizzle-orm";
import { z } from "zod";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { profiles, settings } from "@/db/schema";
import { PromptPanel } from "@/components/prompt-panel";
import { PageHeader } from "@/components/ui";

export default async function ProfilePrompt({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string }>;
}) {
  const { profile: id } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const [[profile], [preferences]] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.id, id!)),
    db.select().from(settings).where(eq(settings.key, "workingPreferences")),
  ]);
  if (!profile) notFound();
  const prompt = `Help me improve my ${profile.displayName} profile for developer roles in India.\n\nProfile URL: ${profile.profileUrl}\nMy priorities: ${profile.notes || "Use my preferences and work history from this conversation."}\n${preferences?.value.context ? `\nMy saved preferences:\n${preferences.value.context}\n` : ""}\nUse what you already know about my actual work. Review the public page when you can access it, or ask me to paste the relevant content. Do not claim you inspected anything you could not access.\n\nSuggest a clear headline, concise summary, stronger evidence of my contributions, and projects worth showcasing. For GitHub or a portfolio, prioritize a working demo, README, architecture, my specific contribution and verifiable outcomes. For LinkedIn or a job portal, focus on discoverable skills and relevant accomplishments.\n\nWork through suggestions with me one section at a time. Keep my voice and ask about missing facts; never invent numbers or experience. Give me the final text and a short bullet list of changes to record in my profile notes. Ask me before publishing or changing an external profile.`;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Improve ${profile.displayName}`}
        description="Copy the prompt into your existing assistant conversation."
      />
      <PromptPanel prompt={prompt} />
      <Link href="/my-profile" className="text-sm text-link">
        Back to my sites & profile
      </Link>
    </div>
  );
}
