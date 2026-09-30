import { NextRequest, NextResponse } from "next/server";
import { accessCookie, credentialDigest, equalCredential } from "@/lib/security";
export async function POST(request: NextRequest) {
  const data = await request.formData();
  const configured = process.env.JOBOPS_ACCESS_TOKEN;
  const token = String(data.get("token") ?? "");
  if (!configured || !equalCredential(token, configured))
    return NextResponse.redirect(new URL("/unlock?error=invalid", request.url), 303);
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(accessCookie, credentialDigest(configured), {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(process.env.APP_URL ?? request.url).protocol === "https:",
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return response;
}
