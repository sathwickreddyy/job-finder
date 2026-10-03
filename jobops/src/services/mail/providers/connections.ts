import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, sql } from "drizzle-orm";
import { db, withDatabaseSession, type SessionDatabase } from "@/db";
import { activityLogs, mailConnections, settings } from "@/db/schema";
import { decryptToken, encryptToken } from "../crypto";
import type { MailConnection, ProviderId, TokenSet } from "./types";

const context = new AsyncLocalStorage<{ database: SessionDatabase; id: string }>();
const lockKey = (id: string) => `jobops-mail:${id}`;

/** Shared across processes; always re-read after locking. Pages commit separately. */
export async function withConnectionLock<T>(
  id: string,
  work: (database: SessionDatabase, current: MailConnection) => Promise<T>,
): Promise<T> {
  return withDatabaseSession(async (database) => {
    await database.execute(sql`select pg_advisory_lock(hashtextextended(${lockKey(id)}, 0))`);
    const [current] = await database
      .select()
      .from(mailConnections)
      .where(eq(mailConnections.id, id));
    if (!current)
      throw new Error("This inbox was disconnected. Connect it again before refreshing.");
    return context.run({ database, id }, () => work(database, current));
  });
}

export async function saveConnection(provider: ProviderId, email: string, tokens: TokenSet) {
  const { providerFor } = await import("./index");
  providerFor(provider);
  email = email.trim().toLowerCase();
  return db.transaction(async (tx) => {
    // Serialize first connects, then coordinate existing accounts with refresh/disconnect.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`jobops-mail-account:${provider}:${email}`}, 0))`,
    );
    const [existing] = await tx
      .select()
      .from(mailConnections)
      .where(and(eq(mailConnections.provider, provider), eq(mailConnections.email, email)));
    if (existing)
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${lockKey(existing.id)}, 0))`,
      );
    if (existing) {
      const [stillConnected] = await tx
        .select({ id: mailConnections.id })
        .from(mailConnections)
        .where(eq(mailConnections.id, existing.id));
      if (!stillConnected)
        throw new Error("This inbox was disconnected during sign-in. Start Connect again.");
    }
    const values = {
      provider,
      email,
      encryptedAccessToken: encryptToken(tokens.accessToken),
      ...(tokens.refreshToken ? { encryptedRefreshToken: encryptToken(tokens.refreshToken) } : {}),
      tokenExpiresAt: tokens.expiresAt,
      lastError: null,
      updatedAt: new Date(),
    };
    const [saved] = await tx
      .insert(mailConnections)
      .values(values)
      .onConflictDoUpdate({
        target: [mailConnections.provider, mailConnections.email],
        set: values,
      })
      .returning();
    return saved;
  });
}

export async function accessTokenFor(connection: MailConnection): Promise<string> {
  const active = context.getStore();
  if (!active || active.id !== connection.id)
    return withConnectionLock(connection.id, (_database, current) => accessTokenFor(current));
  const [current] = await active.database
    .select()
    .from(mailConnections)
    .where(eq(mailConnections.id, connection.id));
  if (!current) throw new Error("This inbox was disconnected. Reconnect the inbox.");
  const { providerFor } = await import("./index");
  const provider = providerFor(current.provider);
  if (!current.tokenExpiresAt || current.tokenExpiresAt.getTime() > Date.now() + 60_000)
    return decryptToken(current.encryptedAccessToken);
  if (!current.encryptedRefreshToken)
    throw new Error(`${current.email} has no refresh token. Reconnect ${provider.label}.`);
  const tokens = await provider.refreshTokens(decryptToken(current.encryptedRefreshToken));
  await active.database
    .update(mailConnections)
    .set({
      encryptedAccessToken: encryptToken(tokens.accessToken),
      ...(tokens.refreshToken ? { encryptedRefreshToken: encryptToken(tokens.refreshToken) } : {}),
      tokenExpiresAt: tokens.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(mailConnections.id, current.id));
  return tokens.accessToken;
}

/** Task17: use this for every disconnect; leaves imported messages/history intact. */
export async function disconnectConnection(id: string) {
  return withConnectionLock(id, async (database, current) => {
    await database.transaction(async (tx) => {
      await tx.delete(settings).where(eq(settings.key, `mailCursor:${id}`));
      await tx.delete(mailConnections).where(eq(mailConnections.id, id));
      await tx.insert(activityLogs).values({
        action: "MAIL_DISCONNECTED",
        entityType: "MAIL",
        entityId: id,
        summary: `Local credentials removed for ${current.email}. Imported messages retained.`,
        metadata: { provider: current.provider, accountEmail: current.email },
      });
    });
    return current;
  });
}
