import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { equalCredential } from "@/lib/security";
import { providerBySlug } from "@/services/mail/providers";
import { saveConnection } from "@/services/mail/providers/connections";
import { trustedAppUrl } from "@/services/mail/providers/oauth";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  let app: URL;
  try {
    app = trustedAppUrl();
  } catch {
    return NextResponse.json(
      { error: "Configure a trusted APP_URL before connecting an inbox." },
      { status: 503 },
    );
  }
  const { provider: slug } = await params;
  let provider;
  try {
    provider = providerBySlug(slug);
  } catch {
    return NextResponse.json({ error: "Unknown or unavailable mail provider." }, { status: 404 });
  }
  let message = "The inbox connection could not be verified. Try connecting again.";
  try {
    const stored = JSON.parse(request.cookies.get("jobops_mail_state")?.value ?? "null");
    const state = request.nextUrl.searchParams.get("state") ?? "";
    const verifier = request.cookies.get("jobops_mail_verifier")?.value ?? "";
    const code = request.nextUrl.searchParams.get("code");
    if (
      (request.headers.get("host") ?? new URL(request.url).host) === app.host &&
      new URL(request.url).protocol === app.protocol &&
      provider.configuration().configured &&
      stored &&
      typeof stored.state === "string" &&
      typeof stored.challenge === "string" &&
      stored.provider === slug &&
      typeof stored.expiresAt === "number" &&
      stored.expiresAt > Date.now() &&
      stored.expiresAt <= Date.now() + 600_000 &&
      /^[A-Za-z0-9_-]{43,128}$/.test(verifier) &&
      state &&
      code &&
      equalCredential(state, stored.state) &&
      equalCredential(
        createHash("sha256").update(verifier).digest("base64url"),
        stored.challenge,
      ) &&
      !request.nextUrl.searchParams.has("error")
    ) {
      const { email, tokens } = await provider.exchangeCode(code, verifier);
      await saveConnection(provider.id, email, tokens);
      message = `${email} connected with read-only access. Refresh when you want new mail.`;
    }
  } catch {
    // OAuth/DB errors may include confidential response data; never put them in URLs/logs.
    message =
      "The inbox could not be connected. Check its read-only permissions and configuration, then reconnect.";
  }
  const response = NextResponse.redirect(
    new URL(`/applications?emails=1&notice=${encodeURIComponent(message)}`, app),
  );
  const options = {
    maxAge: 0,
    path: `/api/mail/${provider.slug}`,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: app.protocol === "https:",
  };
  response.cookies.set("jobops_mail_state", "", options);
  response.cookies.set("jobops_mail_verifier", "", options);
  return response;
}
