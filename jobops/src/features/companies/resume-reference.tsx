import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import type { Company } from "./catalog";
import { companyResumeReference } from "./domain";
import { saveCompanyResume } from "./actions";
import type { CompaniesData } from "./read";

export function CompanyResumeReference({
  company,
  city,
  data,
}: {
  company: Company;
  city: string;
  data: CompaniesData;
}) {
  const { reference, family } = companyResumeReference(company, city, data);
  const key = `${company.id}-${city}`;
  return (
    <section
      id={`resume-${city.toLowerCase().replaceAll(" ", "-")}`}
      className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0"
    >
      <h3 className="text-sm font-semibold">{city}</h3>
      {family ? (
        <div className="text-sm">
          <Link href={`/resumes?resume=${family.id}`} className="text-link">
            {family.version
              ? `Current resume: ${family.version.label}`
              : "Upload a current revision"}
          </Link>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            {family.name}
            {!family.isActive ? " · Archived" : ""}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No resume linked yet</p>
      )}
      <ActionForm action={saveCompanyResume}>
        <input type="hidden" name="companyId" value={company.id} />
        <input type="hidden" name="city" value={city} />
        <label htmlFor={`${key}-resume`} className="block text-sm font-medium">
          Resume for {company.name} in {city}
        </label>
        <select
          id={`${key}-resume`}
          name="resumeId"
          defaultValue={
            typeof reference?.value.resumeId === "string" && family?.isActive ? family.id : ""
          }
        >
          <option value="">Use latest application resume, if recorded</option>
          {data.families
            .filter((row) => row.isActive)
            .map((row) => (
              <option value={row.id} key={row.id}>
                {row.name}
                {row.version ? ` — ${row.version.label}` : " — No current PDF"}
              </option>
            ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Follows the current version of this resume. Submitted files stay unchanged.
        </p>
        <Button size="sm" variant="outline">
          Save resume reference
        </Button>
      </ActionForm>
    </section>
  );
}
