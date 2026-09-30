import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { gmailConfiguration, GMAIL_READONLY_SCOPE } from "@/services/mail/gmail";
export const runtime = "nodejs";
export async function GET() {
  const config = gmailConfiguration();
  if (!config.configured)
    return NextResponse.json(
      {
        error:
          "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI and a base64 32-byte GMAIL_TOKEN_ENCRYPTION_KEY. Mail JSON import remains available.",
      },
      { status: 503 },
    );
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    include_granted_scopes: "false",
  }).toString();
  const response = NextResponse.redirect(url);
  const cookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.redirectUri.startsWith("https:"),
    maxAge: 600,
    path: "/api/gmail",
  };
  response.cookies.set("jobops_gmail_state", state, cookie);
  response.cookies.set("jobops_gmail_verifier", verifier, cookie);
  return response;
}
