import { z } from "zod";
import { searchCompanyMail, readCompanyMail } from "@/features/mail/company-search";
import { runSearchRequest, mailSearchResponse } from "@/features/mail/search-http";
import { MailSearchError } from "@/features/mail/search-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return runSearchRequest(request, searchCompanyMail);
}
export async function GET(request: Request) {
  try {
    const query = z
      .object({
        company: z.string().min(1).max(300),
        view: z.enum(["kept", "excluded"]).default("kept"),
        before: z.string().max(200).optional(),
        account: z.email().optional(),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return mailSearchResponse(
      await readCompanyMail(query.company, query.view, query.before, query.account),
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof MailSearchError)
      return mailSearchResponse({ error: "Choose a valid company and saved-mail page." }, 400);
    return mailSearchResponse({ error: "Saved company mail could not be loaded." }, 500);
  }
}
