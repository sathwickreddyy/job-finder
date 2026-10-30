"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { CompanyMailRule } from "./search-policy";
import { saveWorkspaceRule } from "./workspace-actions";
export function CompanyRuleEditor({
  company,
  rule,
  disabled,
  onSaved,
  onPending,
}: {
  company: string;
  rule: CompanyMailRule;
  disabled: boolean;
  onSaved(): void;
  onPending(value: boolean): void;
}) {
  const [values, setValues] = useState(rule);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  return (
    <details className="rounded-2xl border border-border bg-card p-5" open>
      <summary className="cursor-pointer text-sm font-semibold">
        Company mail rules · {rule.company}
      </summary>
      <p className="text-xs text-muted-foreground">
        Identity matches a sender domain, exact address, or company name in the subject. Job-search
        updates and verified contacted-person replies are kept. Shopping, cloud billing, digests and
        promotions are excluded. Generic mentions in the body do not establish a company match.
      </p>
      <fieldset disabled={disabled || pending} className="grid min-w-0 gap-4 md:grid-cols-2">
        {(
          [
            ["domains", "Recruiting sender domains", "company.com, careers.company.com"],
            ["senders", "Exact recruiting email addresses", "recruiter@company.com"],
            ["aliases", "Other company names in subject", "Company Careers"],
            ["subjectTerms", "Subject must include (optional)", "application, interview, job ID"],
            ["excludedTerms", "Exclude phrases", "newsletter, webinar, invoice"],
          ] as const
        ).map(([key, title, placeholder]) => (
          <label key={key} className="text-xs font-medium">
            {title}
            <input
              className="mt-1.5"
              value={values[key].join(", ")}
              placeholder={placeholder}
              onChange={(event) =>
                setValues((current) => ({ ...current, [key]: event.target.value.split(",") }))
              }
            />
          </label>
        ))}
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              setPending(true);
              onPending(true);
              const form = new FormData();
              form.set("company", company);
              for (const key of [
                "domains",
                "senders",
                "aliases",
                "subjectTerms",
                "excludedTerms",
              ] as const)
                form.set(key, values[key].join(","));
              try {
                const result = await saveWorkspaceRule({}, form);
                setFeedback(
                  result.error ??
                    "Rules saved. Cached content is rechecked. Run a company check to find additional matches; old mail stays old.",
                );
                if (!result.error) onSaved();
              } catch {
                setFeedback("Rules could not be saved. Retry.");
              } finally {
                setPending(false);
                onPending(false);
              }
            }}
          >
            {pending ? "Saving rules…" : "Save company rules"}
          </Button>
        </div>
      </fieldset>
      <p className="mb-0 mt-3 text-xs text-muted-foreground">
        Separate alternatives with commas. Sender/name identities are ORed; optional subject terms
        must also match. The company name “{rule.company}” is always checked in the subject.
      </p>
      {feedback && (
        <p role="status" className="mb-0 mt-3 text-xs text-link">
          {feedback}
        </p>
      )}
    </details>
  );
}
