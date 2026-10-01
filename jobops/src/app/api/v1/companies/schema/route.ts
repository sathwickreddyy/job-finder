import { companyContract, companyResponse } from "@/features/companies/http";
export const runtime = "nodejs";
export async function GET() {
  return companyResponse(companyContract());
}
