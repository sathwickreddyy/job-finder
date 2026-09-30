import Link from "next/link";
import { db } from "@/db";
import { gmailConnections } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { syncGmail } from "./actions";
import { gmailConfiguration } from "@/services/mail/gmail";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
export async function MailRefresh({ compact = false }: { compact?: boolean }) {
  const connections = await db
    .select({
      id: gmailConnections.id,
      email: gmailConnections.email,
      lastSyncedAt: gmailConnections.lastSyncedAt,
    })
    .from(gmailConnections);
  const preferences = await getDisplayPreferences();
  if (!connections.length)
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Connect your recruiting inbox to refresh replies when you need them.
        </p>
        <Button asChild variant="outline">
          <a href={gmailConfiguration().configured ? "/api/gmail/connect" : "/mail#gmail-setup"}>
            Connect Gmail
          </a>
        </Button>
        {!compact && (
          <Link href="/mail/import" className="ml-4 text-sm text-link">
            Import messages
          </Link>
        )}
      </div>
    );
  return (
    <div className="space-y-4">
      {connections.map((c) => (
        <div key={c.id}>
          <ActionForm action={syncGmail}>
            <input type="hidden" name="connectionId" value={c.id} />
            <Button type="submit" variant="outline">
              Refresh mail{connections.length > 1 ? ` · ${c.email}` : ""}
            </Button>
          </ActionForm>
          <p className="mt-2 text-xs text-muted-foreground">
            Last complete refresh: {displayDate(c.lastSyncedAt, preferences, true)}
          </p>
        </div>
      ))}
    </div>
  );
}
