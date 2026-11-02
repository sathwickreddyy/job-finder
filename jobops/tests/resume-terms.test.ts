import { describe, expect, it } from "vitest";
import {
  fromRequirements,
  reviewedTermsSchema,
  termsFingerprint,
  type ReviewedTerm,
} from "@/features/resumes/score/terms";

const term = (t: string, importance: ReviewedTerm["importance"], aliases: string[] = []) => ({
  term: t,
  aliases,
  importance,
  jdQuote: `${t} line`,
});

describe("reviewed term lists", () => {
  it("fingerprint ignores order and skipped terms", () => {
    const a = [term("Java", "required"), term("Kafka", "preferred", ["Apache Kafka", "AK"])];
    const b = [term("Kafka", "preferred", ["AK", "Apache Kafka"]), term("java", "required")];
    expect(termsFingerprint(a)).toBe(termsFingerprint([...b, term("Jira", "skip")]));
    expect(termsFingerprint(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fingerprint changes when importance changes", () => {
    const a = [term("Java", "required"), term("Kafka", "required")];
    const b = [term("Java", "required"), term("Kafka", "preferred")];
    expect(termsFingerprint(a)).not.toBe(termsFingerprint(b));
  });

  it("schema refuses a list with no required term", () => {
    expect(reviewedTermsSchema.safeParse([term("Java", "preferred")]).success).toBe(false);
    expect(reviewedTermsSchema.safeParse([term("Java", "required")]).success).toBe(true);
  });

  it("schema refuses duplicate terms regardless of case", () => {
    const parsed = reviewedTermsSchema.safeParse([term("Java", "required"), term("JAVA", "skip")]);
    expect(parsed.success).toBe(false);
  });

  it("recorded requirements fingerprint like the same reviewed terms", () => {
    const recorded = fromRequirements([
      { term: "Java", aliases: [], importance: "required", jd_quote: "Java line", note: "n" },
    ]);
    expect(recorded).toEqual([term("Java", "required")]);
    expect(termsFingerprint(recorded)).toBe(termsFingerprint([term("Java", "required")]));
  });
});
