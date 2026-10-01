import { NextRequest, NextResponse } from "next/server";
import {
  accessCookie,
  credentialDigest,
  equalCredential,
  isLocalNetworkHost,
  safeOrigin,
} from "@/lib/security";
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/unlock" && !["GET", "HEAD"].includes(request.method))
    return new NextResponse("Use the sign-in form endpoint.", { status: 405 });
  if (request.nextUrl.pathname === "/api/unlock" && request.headers.has("next-action"))
    return new NextResponse("Server actions are not available on this endpoint.", { status: 403 });
  const appUrl = new URL(process.env.APP_URL ?? "http://127.0.0.1:3210");
  let host: URL;
  try {
    const authority = request.headers.get("host");
    if (!authority || /[\s/@?#]/.test(authority)) throw new Error("Invalid host");
    // Use the actual Host, never X-Forwarded-Host or X-Forwarded-For.
    host = new URL(`${request.nextUrl.protocol}//${authority}`);
  } catch {
    return new NextResponse("Invalid host", { status: 400 });
  }
  const trustedLocalNetwork =
    isLocalNetworkHost(appUrl.hostname) &&
    isLocalNetworkHost(host.hostname) &&
    host.port === appUrl.port;
  if (host.host !== appUrl.host && !trustedLocalNetwork)
    return new NextResponse("Host is not allowed. Configure APP_URL for your deployment.", {
      status: 403,
    });
  const taskApi = /^\/api\/v1\/tasks\/[0-9a-f-]+(?:\/(?:updates|proposals|resume))?$/.test(
    request.nextUrl.pathname,
  );
  const companyApi = /^\/api\/v1\/companies(?:\/[^/]+)?\/?$/.test(request.nextUrl.pathname);
  if ((taskApi || companyApi) && request.headers.has("next-action"))
    return NextResponse.json(
      { error: "Server actions are not available on this API." },
      { status: 403 },
    );
  if (
    (!["GET", "HEAD", "OPTIONS"].includes(request.method) ||
      (companyApi && request.headers.has("origin"))) &&
    !safeOrigin(request.headers.get("origin"), trustedLocalNetwork ? host.origin : appUrl.origin) &&
    !((taskApi || (companyApi && trustedLocalNetwork)) && !request.headers.has("origin"))
  )
    return new NextResponse("Request origin is not allowed. Reload JobOps and retry.", {
      status: 403,
    });
  const token = process.env.JOBOPS_ACCESS_TOKEN;
  if (!token && !trustedLocalNetwork)
    return new NextResponse(
      "Set JOBOPS_ACCESS_TOKEN before exposing JobOps beyond the local network.",
      {
        status: 503,
      },
    );
  if (token && token.length < 32)
    return new NextResponse("JOBOPS_ACCESS_TOKEN must contain at least 32 characters.", {
      status: 503,
    });
  // Retired task routes retain their credential checks; local company routes are LAN-trusted.
  if (taskApi) return NextResponse.next();
  if (companyApi && trustedLocalNetwork) return NextResponse.next();
  if (
    token &&
    request.nextUrl.pathname !== "/unlock" &&
    request.nextUrl.pathname !== "/api/unlock"
  ) {
    const provided = request.cookies.get(accessCookie)?.value ?? "";
    if (!equalCredential(provided, credentialDigest(token))) {
      if (
        request.nextUrl.pathname.startsWith("/api/") ||
        request.nextUrl.pathname.endsWith(".json")
      )
        return NextResponse.json(
          { error: "Unlock JobOps in this browser first." },
          { status: 401 },
        );
      return NextResponse.redirect(new URL("/unlock", request.url));
    }
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
