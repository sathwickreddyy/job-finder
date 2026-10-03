import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { providerBySlug } from "@/services/mail/providers";
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
  // Alias cookies would not accompany a callback to the canonical configured host.
  if (
    (request.headers.get("host") ?? new URL(request.url).host) !== app.host ||
    new URL(request.url).protocol !== app.protocol
  )
    return NextResponse.redirect(new URL(`/api/mail/${provider.slug}/connect`, app));
  const config = provider.configuration();
  if (!config.configured)
    return NextResponse.redirect(
      new URL(
        `/applications?tab=emails&notice=${encodeURIComponent(`${provider.label} is not configured. Set ${config.missing.join(", ")}.`)}`,
        app,
      ),
    );
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const response = NextResponse.redirect(provider.authorizeUrl(state, challenge));
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: app.protocol === "https:",
    maxAge: 600,
    path: `/api/mail/${provider.slug}`,
  };
  response.cookies.set(
    "jobops_mail_state",
    JSON.stringify({ state, provider: slug, expiresAt: Date.now() + 600_000, challenge }),
    options,
  );
  response.cookies.set("jobops_mail_verifier", verifier, options);
  return response;
}
