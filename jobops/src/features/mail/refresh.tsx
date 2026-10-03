import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { mailConnections } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { syncGmail } from "./actions";
import { validEncryptionKey } from "@/services/mail/crypto";
import { gmail } from "@/services/mail/providers/gmail";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
export async function MailRefresh({ compact = false }: { compact?: boolean }) {
  const connections = await db
    .select({
      id: mailConnections.id,
      email: mailConnections.email,
      lastSyncedAt: mailConnections.lastSyncedAt,
    })
    .from(mailConnections)
    .where(eq(mailConnections.provider, "GMAIL"));
  const preferences = await getDisplayPreferences();
  const configuration = gmail.configuration();
  const missing = [
    !configuration.clientId && "Google OAuth client ID",
    !configuration.clientSecret && "Google OAuth client secret",
    !configuration.redirectUri && "callback URL",
    !validEncryptionKey() && "token encryption key",
  ].filter(Boolean);
  if (!configuration.configured && !missing.length) missing.push("valid callback URL");
  if (!connections.length)
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Connect your recruiting inbox to refresh replies when you need them.
        </p>
        {configuration.configured ? (
          <Button asChild variant="outline">
            <a href="/api/mail/gmail/connect">Connect Gmail</a>
          </Button>
        ) : (
          <>
            <Button disabled variant="outline" aria-describedby="gmail-configuration">
              Connect Gmail
            </Button>
            <p id="gmail-configuration" className="text-sm text-muted-foreground">
              Gmail configuration is incomplete. Missing or invalid: {missing.join(", ")}. You can
              import messages as JSON.
            </p>
          </>
        )}
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
