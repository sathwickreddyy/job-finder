"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { CompanyMailRule } from "./company-rules";
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
  onSaved(message: string): void;
  onPending(value: boolean): void;
}) {
  // The parent remounts this editor whenever the saved rule changes.
  const [saved] = useState(() => ({
    domains: rule.domains.join(", "),
    senders: rule.senders.join(", "),
    aliases: rule.aliases.join(", "),
    keywords: rule.keywords.join(", "),
    excludedTerms: rule.excludedTerms.join(", "),
  }));
  const [values, setValues] = useState(saved);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const changed = (Object.keys(saved) as (keyof typeof saved)[]).some(
    (key) => values[key] !== saved[key],
  );
  return (
    <>
      <p className="text-xs text-muted-foreground">
        Identity matches a sender domain, exact address, company name in the subject, or a keyword
        in the subject or sender name. Job-search updates and verified contacted-person replies are
        kept. Shopping, cloud billing, digests and promotions are excluded. Generic mentions in the
        body do not establish a company match.
      </p>
      <fieldset disabled={disabled || pending} className="grid min-w-0 gap-4">
        {(
          [
            ["domains", "Recruiting sender domains", "company.com, careers.company.com"],
            ["senders", "Exact recruiting email addresses", "recruiter@company.com"],
            ["aliases", "Other company names in subject", "Company Careers"],
            ["keywords", "Keywords in the subject or sender name", "Company Hiring Team"],
            ["excludedTerms", "Exclude phrases", "newsletter, webinar, invoice"],
          ] as const
        ).map(([key, title, placeholder]) => (
          <label key={key} className="text-xs font-medium">
            {title}
            <input
              className="mt-1.5"
              value={values[key]}
              placeholder={placeholder}
              onChange={(event) =>
                setValues((current) => ({ ...current, [key]: event.target.value }))
              }
            />
          </label>
        ))}
        <div className="flex items-end">
          <Button
            type="button"
            disabled={!changed}
            className="shadow-surface"
            onClick={async () => {
              setPending(true);
              onPending(true);
              const form = new FormData();
              form.set("company", company);
              for (const key of [
                "domains",
                "senders",
                "aliases",
                "keywords",
                "excludedTerms",
              ] as const)
                form.set(key, values[key]);
              try {
                const result = await saveWorkspaceRule({}, form);
                // Saving remounts this editor, so the parent reports success.
                if (result.error) setFeedback(result.error);
                else
                  onSaved(
                    "Rules saved. Cached content is rechecked. Run a company check to find additional matches; old mail stays old.",
                  );
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
    </>
  );
}
