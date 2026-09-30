import { describe, expect, it } from "vitest";
import {
  assertNoRetainedReferences,
  planCleanup,
  tableNames,
  type Snapshot,
} from "../scripts/demo-cleanup";
const empty = () =>
  Object.fromEntries(tableNames.map((table) => [table, []])) as unknown as Snapshot;
const originalDate = "2026-09-30T17:46:10.104Z";
const fixtureJob = {
  id: "00000000-0000-4000-8000-000000000100",
  company: "Orbit Ledger (Demo)",
  canonical_url: "https://careers.example.invalid/jobs/demo-1",
  notes: "Clearly marked fictional demo data.",
  created_at: originalDate,
  updated_at: originalDate,
};
describe("initial fixture cleanup protection", () => {
  it("selects original seed rows while preserving later personal edits and unrelated jobs", () => {
    const snapshot = empty();
    snapshot.jobs = [fixtureJob, { ...fixtureJob, id: "personal-job", company: "My employer" }];
    expect(planCleanup(snapshot).jobs).toEqual([fixtureJob]);
    snapshot.jobs = [{ ...fixtureJob, updated_at: "2026-10-01T00:00:00Z" }];
    expect(planCleanup(snapshot).jobs).toEqual([]);
  });
  it("refuses to remove fixtures referenced by newer personal application records", () => {
    const snapshot = empty();
    snapshot.jobs = [fixtureJob];
    snapshot.applications = [
      { id: "personal-application", job_id: fixtureJob.id, created_at: "2026-10-01T00:00:00Z" },
    ];
    expect(() => planCleanup(snapshot)).toThrow(
      "retained applications record references a fixture",
    );
  });
  it("protects JSON mission references and shared uploads from deletion", () => {
    const snapshot = empty(),
      selected = empty();
    selected.jobs = [fixtureJob];
    snapshot.jobs = [fixtureJob];
    snapshot.missions = [{ id: "personal-mission", input: { selectedJobId: fixtureJob.id } }];
    expect(() => assertNoRetainedReferences(snapshot, selected)).toThrow("retained missions");
    snapshot.missions = [];
    selected.resume_versions = [{ id: "fixture-version", storage_path: "resumes/shared.pdf" }];
    snapshot.resume_versions = [
      ...selected.resume_versions,
      { id: "personal-version", storage_path: "resumes/shared.pdf" },
    ];
    expect(() => assertNoRetainedReferences(snapshot, selected)).toThrow(
      "retained resume_versions",
    );
  });
  it("preserves candidate data with personal contact information even if it retains a demo marker", () => {
    const snapshot = empty();
    snapshot.candidate_profiles = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        full_name: "Demo Candidate",
        primary_email: "demo.candidate@example.invalid",
        metadata: { isDemo: true },
        phone: "personal value",
        created_at: originalDate,
      },
    ];
    expect(planCleanup(snapshot).candidate_profiles).toEqual([]);
  });
  it("preserves edited preferences and all Gmail credentials", () => {
    const snapshot = empty();
    snapshot.settings = [
      { key: "jobPreferences", value: { desiredRoles: ["My role"] }, updated_at: originalDate },
    ];
    snapshot.gmail_connections = [{ id: "gmail", created_at: originalDate }];
    const selected = planCleanup(snapshot);
    expect(selected.settings).toEqual([]);
    expect(selected.gmail_connections).toEqual([]);
  });
});
