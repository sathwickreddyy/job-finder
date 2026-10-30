import type { z } from "zod";
import type { mailConnections } from "@/db/schema";
import type { mailImportSchema } from "@/features/mail/import";
export type ProviderId = "GMAIL" | "OUTLOOK";
export type TokenSet = { accessToken: string; refreshToken: string | null; expiresAt: Date };
export type Cursor = { pageToken?: string; query?: string; next?: string; startedAt?: string };
export type MailConnection = typeof mailConnections.$inferSelect;
export type MailFolder = { id: string; name: string; contextOnly?: boolean };
export type ScannedMessage = z.input<typeof mailImportSchema>[number] & {
  externalId: string;
  folders: string[];
  internetMessageId?: string;
  contextOnly?: boolean;
};
export type MailSearchFilters = {
  keywords: string[];
  senders: string[];
  subjects: string[];
  companyIdentity?: { names: string[]; domains: string[]; senders: string[] };
};
export type ScanRequest = {
  since?: string;
  until: string;
  next?: string;
  search?: MailSearchFilters;
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
  listRecruitingMail(
    connection: MailConnection,
    cursor?: Cursor,
  ): Promise<{ messages: z.input<typeof mailImportSchema>; nextCursor?: Cursor }>;
};
