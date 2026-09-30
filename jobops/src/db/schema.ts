import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const jobStatuses = [
  "NEW",
  "REVIEWING",
  "SHORTLISTED",
  "IGNORED",
  "PREPARING",
  "APPLIED",
  "CLOSED",
] as const;
export const applicationStages = [
  "DRAFT",
  "PREPARING",
  "READY_FOR_REVIEW",
  "APPLIED",
  "ACKNOWLEDGED",
  "ASSESSMENT",
  "RECRUITER_SCREEN",
  "TECHNICAL_INTERVIEW",
  "MANAGER_INTERVIEW",
  "FINAL_INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
  "CLOSED",
] as const;
export const missionStatuses = [
  "DRAFT",
  "READY",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "READY_FOR_REVIEW",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export const missionTypes = [
  "DISCOVER_JOBS",
  "INSPECT_JOB",
  "COMPARE_RESUME",
  "PREPARE_APPLICATION",
  "APPLY_JOB",
  "INSPECT_PROFILE",
  "UPDATE_PROFILE",
  "FIND_CONTACT",
  "VERIFY_CONTACT",
  "REVIEW_MAIL",
  "FOLLOW_UP_REVIEW",
  "CUSTOM",
] as const;
export const operators = ["HUMAN", "CHATGPT", "CLAUDE", "CODEX", "OTHER"] as const;
export const profileProviders = [
  "NAUKRI",
  "LINKEDIN",
  "INSTAHYRE",
  "WELLFOUND",
  "CUTSHORT",
  "OTHER",
] as const;
export const mailClassifications = [
  "APPLICATION_ACKNOWLEDGEMENT",
  "ASSESSMENT",
  "INTERVIEW",
  "REJECTION",
  "OFFER",
  "RECRUITER_OUTREACH",
  "FOLLOW_UP",
  "UNKNOWN",
] as const;
export const contactVerificationStatuses = [
  "UNKNOWN",
  "VALID",
  "INVALID",
  "ACCEPT_ALL",
  "UNVERIFIED",
  "MANUAL_VERIFIED",
] as const;

export const jobStatusEnum = pgEnum("job_status", jobStatuses);
export const applicationStageEnum = pgEnum("application_stage", applicationStages);
export const missionStatusEnum = pgEnum("mission_status", missionStatuses);
export const missionTypeEnum = pgEnum("mission_type", missionTypes);
export const operatorEnum = pgEnum("operator", operators);
export const profileProviderEnum = pgEnum("profile_provider", profileProviders);
export const mailClassificationEnum = pgEnum("mail_classification", mailClassifications);
export const contactVerificationEnum = pgEnum("contact_verification", contactVerificationStatuses);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const date = (name: string) => timestamp(name, { withTimezone: true });
const record = (name: string) => jsonb(name).$type<Record<string, unknown>>().notNull().default({});
const strings = (name: string) => jsonb(name).$type<string[]>().notNull().default([]);

export const candidateProfiles = pgTable(
  "candidate_profiles",
  {
    id: id(),
    fullName: text("full_name"),
    preferredName: text("preferred_name"),
    primaryEmail: text("primary_email"),
    phone: text("phone"),
    currentCity: text("current_city"),
    country: text("country"),
    yearsOfExperience: real("years_of_experience"),
    currentCompany: text("current_company"),
    currentRole: text("current_role"),
    currentCompensation: text("current_compensation"),
    expectedCompensation: text("expected_compensation"),
    noticePeriod: text("notice_period"),
    lastWorkingDay: date("last_working_day"),
    preferredLocations: strings("preferred_locations"),
    remotePreference: text("remote_preference"),
    desiredRoles: strings("desired_roles"),
    linkedinUrl: text("linkedin_url"),
    githubUrl: text("github_url"),
    portfolioUrl: text("portfolio_url"),
    careerSummary: text("career_summary"),
    workAuthorization: text("work_authorization"),
    sponsorship: text("sponsorship"),
    relocationPreference: text("relocation_preference"),
    standardAnswers: jsonb("standard_answers")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    metadata: record("metadata"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "candidate_experience_nonnegative",
      sql`${t.yearsOfExperience} IS NULL OR ${t.yearsOfExperience} >= 0`,
    ),
  ],
);

export const resumes = pgTable(
  "resumes",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("General"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("resumes_slug_idx").on(t.slug)],
);

export const resumeVersions = pgTable(
  "resume_versions",
  {
    id: id(),
    resumeId: uuid("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "restrict" }),
    versionLabel: text("version_label").notNull(),
    originalFilename: text("original_filename").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    fileSize: integer("file_size").notNull(),
    sha256: text("sha256").notNull(),
    extractedText: text("extracted_text").notNull().default(""),
    summary: text("summary"),
    skills: strings("skills"),
    keywords: strings("keywords"),
    experienceTags: strings("experience_tags"),
    parsingStatus: text("parsing_status").notNull().default("PENDING"),
    parsingError: text("parsing_error"),
    createdAt: createdAt(),
    isCurrent: boolean("is_current").notNull().default(false),
  },
  (t) => [
    index("resume_versions_family_idx").on(t.resumeId),
    index("resume_versions_sha_idx").on(t.sha256),
    uniqueIndex("resume_versions_current_idx")
      .on(t.resumeId)
      .where(sql`${t.isCurrent} = true`),
    check("resume_versions_size_check", sql`${t.fileSize} > 0 AND ${t.fileSize} <= 10485760`),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    location: text("location").notNull().default(""),
    workMode: text("work_mode").notNull().default("UNKNOWN"),
    employmentType: text("employment_type").notNull().default("FULL_TIME"),
    canonicalUrl: text("canonical_url").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    source: text("source").notNull(),
    externalId: text("external_id"),
    experienceMin: real("experience_min"),
    experienceMax: real("experience_max"),
    salaryMin: real("salary_min"),
    salaryMax: real("salary_max"),
    currency: text("currency"),
    postedAt: date("posted_at"),
    firstSeenAt: date("first_seen_at").notNull().defaultNow(),
    lastSeenAt: date("last_seen_at").notNull().defaultNow(),
    status: jobStatusEnum("status").notNull().default("NEW"),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("jobs_url_idx").on(t.canonicalUrl),
    uniqueIndex("jobs_dedupe_idx").on(t.dedupeKey),
    index("jobs_company_title_idx").on(t.company, t.title),
    index("jobs_status_idx").on(t.status),
    index("jobs_posted_idx").on(t.postedAt),
    check(
      "jobs_experience_range",
      sql`(${t.experienceMin} IS NULL OR ${t.experienceMin} >= 0) AND (${t.experienceMax} IS NULL OR ${t.experienceMax} >= 0) AND (${t.experienceMin} IS NULL OR ${t.experienceMax} IS NULL OR ${t.experienceMin} <= ${t.experienceMax})`,
    ),
    check(
      "jobs_salary_range",
      sql`(${t.salaryMin} IS NULL OR ${t.salaryMin} >= 0) AND (${t.salaryMax} IS NULL OR ${t.salaryMax} >= 0) AND (${t.salaryMin} IS NULL OR ${t.salaryMax} IS NULL OR ${t.salaryMin} <= ${t.salaryMax})`,
    ),
  ],
);

export const jobSnapshots = pgTable(
  "job_snapshots",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    capturedAt: date("captured_at").notNull().defaultNow(),
    description: text("description").notNull().default(""),
    requirements: strings("requirements"),
    skills: strings("skills"),
    rawText: text("raw_text").notNull().default(""),
    metadata: record("metadata"),
  },
  (t) => [index("job_snapshots_job_idx").on(t.jobId, t.capturedAt)],
);

export const jobResumeMatches = pgTable(
  "job_resume_matches",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    resumeVersionId: uuid("resume_version_id")
      .notNull()
      .references(() => resumeVersions.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    matchedKeywords: strings("matched_keywords"),
    missingKeywords: strings("missing_keywords"),
    manualNotes: text("manual_notes").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("job_resume_matches_pair_idx").on(t.jobId, t.resumeVersionId),
    check("job_resume_matches_score", sql`${t.score} >= 0 AND ${t.score} <= 100`),
  ],
);

export const applications = pgTable(
  "applications",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "restrict" }),
    resumeVersionId: uuid("resume_version_id").references(() => resumeVersions.id, {
      onDelete: "restrict",
    }),
    status: applicationStageEnum("status").notNull().default("DRAFT"),
    appliedAt: date("applied_at"),
    applicationUrl: text("application_url"),
    source: text("source").notNull().default("MANUAL"),
    nextActionAt: date("next_action_at"),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("applications_job_idx").on(t.jobId),
    index("applications_resume_idx").on(t.resumeVersionId),
    index("applications_status_idx").on(t.status),
    index("applications_next_action_idx").on(t.nextActionAt),
  ],
);

export const applicationEvents = pgTable(
  "application_events",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    source: text("source").notNull().default("MANUAL"),
    summary: text("summary").notNull(),
    payload: record("payload"),
    confidence: real("confidence"),
    occurredAt: date("occurred_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index("application_events_app_idx").on(t.applicationId, t.occurredAt),
    check(
      "application_events_confidence",
      sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`,
    ),
  ],
);

export const profiles = pgTable("profiles", {
  id: id(),
  provider: profileProviderEnum("provider").notNull(),
  displayName: text("display_name").notNull(),
  profileUrl: text("profile_url").notNull(),
  usernameOrEmail: text("username_or_email"),
  status: text("status").notNull().default("ACTIVE"),
  lastInspectedAt: date("last_inspected_at"),
  lastUpdatedAt: date("last_updated_at"),
  targetState: record("target_state"),
  knownState: record("known_state"),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    company: text("company").notNull(),
    name: text("name").notNull(),
    title: text("title").notNull().default(""),
    email: text("email"),
    linkedinUrl: text("linkedin_url"),
    source: text("source").notNull().default("MANUAL"),
    verificationStatus: contactVerificationEnum("verification_status").notNull().default("UNKNOWN"),
    verificationSource: text("verification_source"),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("contacts_company_idx").on(t.company)],
);

export const missions = pgTable(
  "missions",
  {
    id: id(),
    type: missionTypeEnum("type").notNull(),
    title: text("title").notNull(),
    entityType: text("entity_type").notNull().default("NONE"),
    entityId: uuid("entity_id"),
    goal: text("goal").notNull(),
    status: missionStatusEnum("status").notNull().default("DRAFT"),
    priority: integer("priority").notNull().default(2),
    constraints: record("constraints"),
    input: record("input"),
    expectedResult: record("expected_result"),
    createdBy: text("created_by").notNull().default("HUMAN"),
    createdAt: createdAt(),
    startedAt: date("started_at"),
    completedAt: date("completed_at"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("missions_status_type_idx").on(t.status, t.type),
    index("missions_entity_idx").on(t.entityType, t.entityId),
    check("missions_priority", sql`${t.priority} BETWEEN 1 AND 5`),
  ],
);

export const missionSteps = pgTable(
  "mission_steps",
  {
    id: id(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    title: text("title").notNull(),
    instruction: text("instruction").notNull(),
    status: text("status").notNull().default("PENDING"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    metadata: record("metadata"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("mission_steps_sequence_idx").on(t.missionId, t.sequence),
    check("mission_steps_positive_sequence", sql`${t.sequence} > 0`),
  ],
);

export const missionExecutions = pgTable(
  "mission_executions",
  {
    id: id(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    operator: operatorEnum("operator").notNull().default("HUMAN"),
    status: missionStatusEnum("status").notNull().default("IN_PROGRESS"),
    startedAt: date("started_at").notNull().defaultNow(),
    completedAt: date("completed_at"),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("mission_executions_mission_idx").on(t.missionId)],
);

export const missionEvidence = pgTable(
  "mission_evidence",
  {
    id: id(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id").references(() => missionExecutions.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    value: text("value").notNull(),
    storagePath: text("storage_path"),
    metadata: record("metadata"),
    createdAt: createdAt(),
  },
  (t) => [index("mission_evidence_mission_idx").on(t.missionId)],
);

export const mailMessages = pgTable(
  "mail_messages",
  {
    id: id(),
    externalId: text("external_id").notNull(),
    threadId: text("thread_id"),
    provider: text("provider").notNull().default("IMPORT"),
    sender: text("sender").notNull(),
    senderName: text("sender_name").notNull().default(""),
    recipient: text("recipient").notNull().default(""),
    subject: text("subject").notNull(),
    snippet: text("snippet").notNull().default(""),
    receivedAt: date("received_at").notNull(),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    classification: mailClassificationEnum("classification").notNull().default("UNKNOWN"),
    linkedApplicationId: uuid("linked_application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    processedAt: date("processed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("mail_messages_external_idx").on(t.provider, t.externalId),
    index("mail_messages_received_idx").on(t.receivedAt),
  ],
);

export const mailEvents = pgTable(
  "mail_events",
  {
    id: id(),
    mailMessageId: uuid("mail_message_id")
      .notNull()
      .references(() => mailMessages.id, { onDelete: "cascade" }),
    type: mailClassificationEnum("type").notNull(),
    confidence: real("confidence").notNull(),
    linkedApplicationId: uuid("linked_application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("NEEDS_REVIEW"),
    details: record("details"),
    createdAt: createdAt(),
  },
  (t) => [
    index("mail_events_status_idx").on(t.status),
    index("mail_events_message_idx").on(t.mailMessageId),
    check("mail_events_confidence", sql`${t.confidence} >= 0 AND ${t.confidence} <= 1`),
  ],
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: id(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    summary: text("summary").notNull(),
    metadata: record("metadata"),
    createdAt: createdAt(),
  },
  (t) => [index("activity_logs_created_idx").on(t.createdAt)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: record("value"),
  updatedAt: updatedAt(),
});

export const gmailConnections = pgTable(
  "gmail_connections",
  {
    id: id(),
    email: text("email").notNull(),
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: date("token_expires_at"),
    lastSyncedAt: date("last_synced_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("gmail_connections_email_idx").on(t.email)],
);
