// This one-time cleanup recognizes only fixtures from the initial development session.
// Later records, modified examples and unrelated settings are intentionally preserved.
export type Row = Record<string, unknown>;
export const tableNames = [
  "candidate_profiles",
  "resumes",
  "resume_versions",
  "jobs",
  "job_snapshots",
  "job_resume_matches",
  "applications",
  "application_events",
  "profiles",
  "contacts",
  "missions",
  "mission_steps",
  "mission_executions",
  "mission_evidence",
  "mail_messages",
  "mail_events",
  "activity_logs",
  "settings",
  "gmail_connections",
] as const;
export type TableName = (typeof tableNames)[number];
export type Snapshot = Record<TableName, Row[]>;
const stableId = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const initialSessionEnd = Date.parse("2026-09-30T18:10:00Z");
const text = (row: Row, key: string) => String(row[key] ?? "");
const record = (value: unknown): Row => (value && typeof value === "object" ? (value as Row) : {});
const isInitial = (row: Row) => {
  const timestamps = [row.updated_at, row.created_at, row.captured_at].filter(Boolean);
  return (
    timestamps.length > 0 &&
    timestamps.every((value) => Date.parse(String(value)) <= initialSessionEnd)
  );
};
const stableRange = (row: Row, first: number, last: number) =>
  Array.from({ length: last - first + 1 }, (_, index) => stableId(first + index)).includes(
    text(row, "id"),
  );
const sameJson = (first: unknown, second: unknown): boolean => {
  if (Array.isArray(first) || Array.isArray(second))
    return JSON.stringify(first) === JSON.stringify(second);
  if (first && second && typeof first === "object" && typeof second === "object") {
    const a = record(first),
      b = record(second);
    return (
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((key) => sameJson(a[key], b[key]))
    );
  }
  return first === second;
};

export function planCleanup(snapshot: Snapshot): Snapshot {
  const selected = Object.fromEntries(
    tableNames.map((table) => [table, []]),
  ) as unknown as Snapshot;
  const choose = (table: TableName, predicate: (row: Row) => boolean) => {
    selected[table] = snapshot[table].filter((row) => isInitial(row) && predicate(row));
  };
  const has = (table: TableName, id: unknown) => selected[table].some((row) => row.id === id);
  choose(
    "candidate_profiles",
    (row) =>
      row.id === stableId(1) &&
      row.full_name === "Demo Candidate" &&
      row.primary_email === "demo.candidate@example.invalid" &&
      record(row.metadata).isDemo === true &&
      [
        "phone",
        "linkedin_url",
        "github_url",
        "portfolio_url",
        "current_compensation",
        "expected_compensation",
      ].every((key) => !row[key]),
  );
  choose(
    "resumes",
    (row) =>
      (stableRange(row, 10, 12) &&
        /^Demo /.test(text(row, "name")) &&
        /^Fictional example /.test(text(row, "description"))) ||
      (/^Browser Test Resume \d{13}$/.test(text(row, "name")) &&
        row.description === "Fictional test data, safe to archive.") ||
      (/^Browser Damaged PDF \d{13}$/.test(text(row, "name")) && !row.description),
  );
  choose(
    "resume_versions",
    (row) =>
      has("resumes", row.resume_id) &&
      ((stableRange(row, 20, 25) && /^demo-.*-v[12]\.pdf$/.test(text(row, "original_filename"))) ||
        (/^fictional-v[12]\.pdf$/.test(text(row, "original_filename")) &&
          text(row, "extracted_text").includes("Fictional resume for browser verification.")) ||
        (row.original_filename === "damaged.pdf" &&
          row.version_label === "Preserved failed extraction" &&
          row.parsing_status === "FAILED")),
  );
  choose(
    "jobs",
    (row) =>
      (stableRange(row, 100, 107) &&
        row.notes === "Clearly marked fictional demo data." &&
        /^https:\/\/careers\.example\.invalid\/jobs\/demo-[1-8]$/.test(
          text(row, "canonical_url"),
        )) ||
      (/^Browser (Manual|Import) \d{13}$/.test(text(row, "company")) &&
        /^https:\/\/example\.com\/(jobs|careers)\//.test(text(row, "canonical_url"))) ||
      (/^Mission Demo (review|unknown)-\d{13}$/.test(text(row, "company")) &&
        /^https:\/\/example\.com\/mission-job\/(review|unknown)-\d{13}$/.test(
          text(row, "canonical_url"),
        )),
  );
  choose(
    "profiles",
    (row) =>
      (stableRange(row, 400, 401) &&
        /^Demo (Naukri|LinkedIn) Profile$/.test(text(row, "display_name")) &&
        /^Fictional /.test(text(row, "notes"))) ||
      (/^Test portal \d{13}$/.test(text(row, "display_name")) &&
        /^https:\/\/example\.invalid\/profile\/\d{13}$/.test(text(row, "profile_url"))) ||
      (/^Mission Profile \d{13}$/.test(text(row, "display_name")) &&
        /^https:\/\/example\.com\/profile\/\d{13}$/.test(text(row, "profile_url"))),
  );
  choose(
    "contacts",
    (row) =>
      (row.id === stableId(450) &&
        row.email === "alex@example.invalid" &&
        row.source === "Fictional seed data") ||
      (/^Recruiter \d{13}$/.test(text(row, "name")) &&
        /^recruiter-\d{13}@example\.invalid$/.test(text(row, "email")) &&
        row.source === "https://example.invalid/team"),
  );
  choose("applications", (row) => has("jobs", row.job_id));
  choose(
    "missions",
    (row) =>
      (stableRange(row, 500, 502) && record(row.input).isDemo === true) ||
      (row.type === "DISCOVER_JOBS" && /^Discovery browser \d{13}$/.test(text(row, "title"))) ||
      (row.entity_type === "JOB" &&
        has("jobs", row.entity_id) &&
        /^Apply mission (review|unknown)-\d{13}$/.test(text(row, "title"))) ||
      (row.entity_type === "PROFILE" &&
        has("profiles", row.entity_id) &&
        /^Update profile · (Test portal|Mission Profile) \d{13}$/.test(text(row, "title"))),
  );
  choose(
    "mail_messages",
    (row) =>
      (stableRange(row, 800, 802) &&
        row.provider === "DEMO" &&
        text(row, "sender").endsWith("@example.invalid")) ||
      (row.provider === "IMPORT" &&
        /^e2e-mail-\d{13}$/.test(text(row, "external_id")) &&
        row.sender === "recruiting@example.invalid"),
  );
  choose("job_snapshots", (row) => has("jobs", row.job_id));
  choose(
    "job_resume_matches",
    (row) => has("jobs", row.job_id) && has("resume_versions", row.resume_version_id),
  );
  choose("application_events", (row) => has("applications", row.application_id));
  choose("mission_steps", (row) => has("missions", row.mission_id));
  choose("mission_executions", (row) => has("missions", row.mission_id));
  choose("mission_evidence", (row) => has("missions", row.mission_id));
  choose("mail_events", (row) => has("mail_messages", row.mail_message_id));
  const entities = new Set(
    Object.values(selected)
      .flat()
      .map((row) => row.id),
  );
  const initialImportLogs = new Set([
    "51448bab-c2a9-4659-8e72-85467a7c48e7",
    "bc0fdcc0-1315-4f8c-847c-6b8209004c08",
    "38a4c1f6-ca74-443d-9ea0-a86aceee92ee",
  ]);
  choose(
    "activity_logs",
    (row) =>
      entities.has(row.entity_id) ||
      (record(row.metadata).isDemo === true &&
        ["DEMO_SEEDED", "DEMO_REFERENCES_NORMALIZED"].includes(text(row, "action"))) ||
      (row.action === "MAIL_IMPORTED" && initialImportLogs.has(text(row, "id"))),
  );
  choose(
    "settings",
    (row) =>
      (row.key === "jobPreferences" &&
        sameJson(row.value, {
          desiredRoles: ["Senior Backend Engineer", "Platform Engineer"],
          locations: ["Bengaluru", "Hyderabad", "Remote"],
          minExperience: 4,
          maxExperience: 8,
          preferredTechnologies: ["Python", "Java", "Kafka", "PostgreSQL"],
          excludedRoles: ["Intern"],
          remotePreference: "HYBRID_OR_REMOTE",
        })) ||
      (row.key === "missionDefaults" &&
        sameJson(row.value, {
          stopBeforeSubmission: true,
          stopOnUnknown: true,
          maximumResults: 20,
          defaultOperator: "HUMAN",
        })),
  );
  assertNoRetainedReferences(snapshot, selected);
  return selected;
}

export function assertNoRetainedReferences(snapshot: Snapshot, selected: Snapshot) {
  const removedIds = new Set(
    Object.values(selected)
      .flat()
      .map((row) => row.id)
      .filter(Boolean),
  );
  const removedFiles = new Set(
    Object.values(selected)
      .flat()
      .map((row) => row.storage_path)
      .filter(Boolean),
  );
  const containsReference = (value: unknown): boolean => {
    if (typeof value === "string") return removedIds.has(value) || removedFiles.has(value);
    if (Array.isArray(value)) return value.some(containsReference);
    return !!value && typeof value === "object" && Object.values(value).some(containsReference);
  };
  for (const table of tableNames) {
    const keys = new Set(selected[table].map((row) => row.id ?? row.key));
    if (snapshot[table].some((row) => !keys.has(row.id ?? row.key) && containsReference(row)))
      throw new Error(
        `Cleanup stopped: a retained ${table} record references a fixture. Review the mixed data first.`,
      );
  }
}
