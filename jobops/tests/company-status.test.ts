import { expect, it } from "vitest";
import { companyStatus } from "@/features/companies/status";
import type { PreviousJob } from "@/features/companies/previous-job";
import { NOW, at, record } from "./lane-fixtures";

const amazon2022: PreviousJob = {
  applicationId: "prev",
  companyKey: "oracle",
  role: "SDE I",
  joinedOn: "2022-04",
  leftOn: "2024-01",
};

it("an accepted current offer is Accepted, not a previous job", () => {
  const status = companyStatus({
    records: [record({ phase: "Closed", status: "CLOSED", closedReason: "ACCEPTED" })],
    mailCount: 3,
    previousJobs: [],
    now: NOW,
  });
  expect(status).toMatchObject({ tone: "accepted", label: "Accepted", previous: null });
});

it("a company with mail and no records is Mail only", () => {
  expect(companyStatus({ records: [], mailCount: 2, previousJobs: [], now: NOW })).toMatchObject({
    tone: "mailOnly",
    label: "Mail only",
  });
  expect(companyStatus({ records: [], mailCount: 0, previousJobs: [], now: NOW }).tone).toBe(
    "none",
  );
});

it("a previous job keeps its badge beside a live status", () => {
  const status = companyStatus({
    records: [
      record({
        id: "prev",
        phase: "Closed",
        status: "CLOSED",
        closedReason: "ACCEPTED",
        source: "PREVIOUS_JOB",
      }),
      record({
        phase: "Interviewing",
        status: "TECHNICAL_INTERVIEW",
        sentAt: at("2026-09-20T10:00:00"),
      }),
    ],
    mailCount: 4,
    previousJobs: [amazon2022],
    now: NOW,
  });
  expect(status.tone).toBe("interviewing");
  expect(status.label).toBe("Interviewing");
  expect(status.previous).toEqual({ role: "SDE I", joined: "2022-04", left: "2024-01" });
});

it("a previous job alone is not a live status", () => {
  const status = companyStatus({
    records: [
      record({
        id: "prev",
        phase: "Closed",
        status: "CLOSED",
        closedReason: "ACCEPTED",
        source: "PREVIOUS_JOB",
      }),
    ],
    mailCount: 5,
    previousJobs: [amazon2022],
    now: NOW,
  });
  expect(status.tone).toBe("mailOnly");
  expect(status.previous).not.toBeNull();
});

it("carries the lane detail, such as how long it has been quiet", () => {
  const status = companyStatus({
    records: [record({ sentAt: at("2026-09-20T12:00:00") })],
    mailCount: 0,
    previousJobs: [],
    now: NOW,
  });
  expect(status).toMatchObject({ tone: "quiet", label: "Quiet", detail: "Quiet for 13 days" });
});
