import type { z } from "zod";
import type { mailConnections } from "@/db/schema";
import type { mailImportSchema } from "@/features/mail/import";
import type { SearchRequest } from "./search-query";
export type ProviderId = "GMAIL" | "OUTLOOK";
export type TokenSet = { accessToken: string; refreshToken: string | null; expiresAt: Date };
export type MailConnection = typeof mailConnections.$inferSelect;
export type MailFolder = { id: string; name: string; contextOnly?: boolean };
export type ScannedMessage = z.input<typeof mailImportSchema>[number] & {
  externalId: string;
  folders: string[];
  internetMessageId?: string;
  contextOnly?: boolean;
};
export type ScanRequest = {
  since?: string;
  until: string;
  next?: string;
  skipIds?: string[];
  skipInternetIds?: string[];
};
export type MailProvider = {
  id: ProviderId;
  slug: "gmail" | "outlook";
  label: string;
  configuration(): {
    configured: boolean;
    missing: string[];
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  authorizeUrl(state: string, codeChallenge: string): URL;
  exchangeCode(code: string, verifier: string): Promise<{ email: string; tokens: TokenSet }>;
  refreshTokens(refreshToken: string): Promise<TokenSet>;
  accessToken(connection: MailConnection): Promise<string>;
  folders(connection: MailConnection): Promise<MailFolder[]>;
  scanMail(
    connection: MailConnection,
    request: ScanRequest,
    folders: MailFolder[],
  ): Promise<{
    messages: ScannedMessage[];
    next?: string;
    fetched?: number;
    skippedKnown?: number;
    skippedUnavailable?: number;
  }>;
  /** One page of a company search; `query` is exactly what was sent. */
  searchMail(
    connection: MailConnection,
    request: SearchRequest,
    folders: MailFolder[],
  ): Promise<{ messages: ScannedMessage[]; next?: string; query: string }>;
  /** One message by its provider id, or null when the mailbox no longer has it. */
  fetchMessage(
    connection: MailConnection,
    providerMessageId: string,
    folders: MailFolder[],
  ): Promise<ScannedMessage | null>;
};
