import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { exchangeGoogleCode } from "@/services/mail/gmail";
import { actionError } from "@/lib/actions";
import { equalCredential } from "@/lib/security";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const storedState = request.cookies.get("jobops_gmail_state")?.value ?? "";
  const verifier = request.cookies.get("jobops_gmail_verifier")?.value ?? "";
  let message = "Gmail connection could not be verified. Try Connect Gmail again.";
  const code = request.nextUrl.searchParams.get("code");
  if (
    state &&
    verifier &&
    equalCredential(state, storedState) &&
    code &&
    !request.nextUrl.searchParams.has("error")
  ) {
    try {
      const email = await exchangeGoogleCode(code, verifier);
      await db.insert(activityLogs).values({
        action: "GMAIL_CONNECTED",
        entityType: "MAIL",
        summary: `Gmail read-only connection established for ${email}`,
      });
      message = "Gmail connected with read-only access. Sync messages when ready.";
    } catch (error) {
      message =
        actionError(error).error ??
        "Gmail connection failed. Check OAuth configuration and reconnect.";
    }
  }
  const response = NextResponse.redirect(
    new URL(
      `/applications?tab=emails&notice=${encodeURIComponent(message)}`,
      process.env.APP_URL ?? request.url,
    ),
  );
  response.cookies.set("jobops_gmail_state", "", { maxAge: 0, path: "/api/gmail" });
  response.cookies.set("jobops_gmail_verifier", "", { maxAge: 0, path: "/api/gmail" });
  return response;
}
