import { describe, expect, it } from "vitest";
import {
  bucketOf,
  isJobAlert,
  linkHref,
  queueMailFrom,
  suggestedOutcome,
} from "@/features/mail/triage";

const id = "00000000-0000-4000-8000-000000000123";
const record = "00000000-0000-4000-8000-000000000456";
const receivedAt = new Date("2026-10-03T08:30:00.000Z");

describe("triage buckets", () => {
  it("recognises job-alert sender domains without trusting look-alikes", () => {
    expect(isJobAlert("alerts@mailer.naukri.com")).toBe(true);
    expect(isJobAlert("Jobs@SUB.INSTAHYRE.COM")).toBe(true);
    expect(isJobAlert("jobs-noreply@linkedin.com")).toBe(true);
    expect(isJobAlert("jobalerts-noreply@linkedin.com")).toBe(true);
    expect(isJobAlert("hr@linkedin.com")).toBe(false);
    expect(isJobAlert("jobs@naukri.com.example")).toBe(false);
    expect(isJobAlert("jobs@notnaukri.com")).toBe(false);
    expect(isJobAlert("jobs@linkedin.com.example")).toBe(false);
  });

  it("sorts updates, new roles, and noise", () => {
    expect(
      bucketOf({ sender: "talent@razorpay.com", classification: "INTERVIEW", recordId: null }),
    ).toBe("updates");
    expect(
      bucketOf({ sender: "neha@inmobi.com", classification: "RECRUITER_OUTREACH", recordId: null }),
    ).toBe("roles");
    expect(
      bucketOf({
        sender: "neha@inmobi.com",
        classification: "RECRUITER_OUTREACH",
        recordId: record,
      }),
    ).toBe("updates");
    expect(
      bucketOf({
        sender: "careers@flipkart.com",
        classification: "APPLICATION_ACKNOWLEDGEMENT",
        recordId: record,
      }),
    ).toBe("noise");
    expect(
      bucketOf({ sender: "jobalerts@naukri.com", classification: "INTERVIEW", recordId: null }),
    ).toBe("noise");
    expect(
      bucketOf({ sender: "hr@linkedin.com", classification: "RECRUITER_OUTREACH", recordId: null }),
    ).toBe("roles");
  });

  it("maps each classification to its intended outcome, leaving acknowledgements outcome-free", () => {
    expect(suggestedOutcome).toEqual({
      ASSESSMENT: "oa",
      INTERVIEW: "scheduled",
      OFFER: "offer",
      REJECTION: "rejected",
      FOLLOW_UP: "heard",
      RECRUITER_OUTREACH: "heard",
      APPLICATION_ACKNOWLEDGEMENT: null,
      UNKNOWN: null,
    });
  });

  it("links mail to its record with the suggested outcome", () => {
    expect(linkHref({ id, classification: "ASSESSMENT" }, record)).toBe(
      `/applications/${record}?mail=${id}&outcome=oa#what-happened`,
    );
    expect(linkHref({ id, classification: "UNKNOWN" }, record)).toBe(
      `/applications/${record}?mail=${id}#what-happened`,
    );
    expect(linkHref({ id, classification: "APPLICATION_ACKNOWLEDGEMENT" }, record)).toBe(
      `/applications/${record}?mail=${id}#what-happened`,
    );
  });

  it("puts updates and new roles in Next, never noise or acknowledgements", () => {
    const base = {
      sender: "x@example.invalid",
      senderName: "",
      receivedAt,
      classification: "INTERVIEW" as const,
    };
    const items = queueMailFrom([
      {
        ...base,
        id,
        subject: "Interview",
        bucket: "updates",
        record: { id: record, company: "Uber" },
      },
      {
        ...base,
        id: record,
        subject: "New role",
        classification: "RECRUITER_OUTREACH",
        bucket: "roles",
        record: null,
      },
      {
        ...base,
        id: "00000000-0000-4000-8000-000000000789",
        subject: "Alert",
        bucket: "noise",
        record: null,
      },
      {
        ...base,
        id: "00000000-0000-4000-8000-000000000987",
        subject: "Application received",
        classification: "APPLICATION_ACKNOWLEDGEMENT",
        bucket: "noise",
        record: { id: record, company: "Uber" },
      },
    ]);

    expect(items.map((item) => [item.title, item.primary.label])).toEqual([
      ["Interview", "Link and update"],
      ["New role", "Save as opening"],
    ]);
    expect(items[0]).toMatchObject({
      id,
      title: "Interview",
      detail: "x@example.invalid · Uber",
      receivedAt,
      primary: {
        label: "Link and update",
        href: `/applications/${record}?mail=${id}&outcome=scheduled#what-happened`,
      },
    });
    expect(items[1]).toMatchObject({
      id: record,
      title: "New role",
      detail: "x@example.invalid",
      receivedAt,
      primary: { label: "Save as opening", href: `/jobs/new?fromMail=${record}` },
    });
  });
});
