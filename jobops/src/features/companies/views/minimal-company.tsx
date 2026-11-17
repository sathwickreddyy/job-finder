import { cn } from "@/lib/utils";
import type { CompanyApplications } from "../applications";
import { ApplicationsTab } from "./applications-tab";
import { CompanyHeader } from "./company-header";

const research = ["Compensation", "Interview loop", "About & sources"];

/**
 * The company page for a company with applications but no company record: the Applications tab
 * alone, with the research tabs greyed until the company is added through the company API.
 */
export function MinimalCompanyPage({
  name,
  companyKey,
  data,
  openId,
  requested,
  mailIntent,
  notice,
  now,
}: {
  name: string;
  companyKey: string;
  data: CompanyApplications;
  openId?: string | null;
  requested?: string;
  mailIntent?: string;
  notice?: string;
  now: Date;
}) {
  return (
    <div className="space-y-8">
      <CompanyHeader
        name={name}
        companyKey={companyKey}
        cities={[]}
        workModes={[]}
        stage={null}
        data={data}
        action={{ label: "Record application", href: "/applications/new" }}
      />
      <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Not in your Companies list yet. Ask Claude Code or Codex to add it; pay, interview loop and
        sources appear then.
      </p>
      <div>
        <div
          role="tablist"
          aria-label="Company sections"
          className="flex gap-5 overflow-x-auto border-b border-border [scrollbar-width:none] sm:gap-6"
        >
          <button
            role="tab"
            type="button"
            id="tab-applications"
            aria-selected="true"
            aria-controls="panel-applications"
            className="relative shrink-0 whitespace-nowrap pb-3 text-sm font-medium text-link"
          >
            {`Applications · ${data.rows.length}`}
            <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-t-full bg-primary" />
          </button>
          {research.map((label) => (
            <span
              key={label}
              role="tab"
              aria-selected="false"
              aria-disabled="true"
              className={cn(
                "shrink-0 cursor-not-allowed whitespace-nowrap pb-3 text-sm font-medium",
                "text-muted-foreground opacity-50",
              )}
            >
              {label}
            </span>
          ))}
        </div>
        <div
          role="tabpanel"
          id="panel-applications"
          aria-labelledby="tab-applications"
          className="pt-8"
        >
          <ApplicationsTab
            data={data}
            companyKey={companyKey}
            companyName={name}
            openId={openId}
            requested={requested}
            mailIntent={mailIntent}
            notice={notice}
            now={now}
          />
        </div>
      </div>
    </div>
  );
}
