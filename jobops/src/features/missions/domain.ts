import { z } from "zod";
import { computeProfileDiff } from "@/features/profiles/diff";

export const MISSION_TYPES = [
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
export const MISSION_STATUSES = [
  "DRAFT",
  "READY",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "READY_FOR_REVIEW",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export const OPERATORS = ["HUMAN", "CHATGPT", "CLAUDE", "CODEX", "OTHER"] as const;
export type MissionType = (typeof MISSION_TYPES)[number];
export type MissionStatus = (typeof MISSION_STATUSES)[number];
export type JsonRecord = Record<string, unknown>;
export const jsonRecord = z.record(z.string(), z.unknown());
export const PROFILE_FIELDS = [
  "headline",
  "summary",
  "currentRole",
  "experience",
  "skills",
  "preferredRoles",
  "preferredLocations",
  "noticePeriod",
  "currentResumeId",
  "currentResumeIdentifier",
] as const;
const profileStateSchema = jsonRecord.superRefine((record, context) => {
  for (const [field, value] of Object.entries(record)) {
    if (!(PROFILE_FIELDS as readonly string[]).includes(field))
      context.addIssue({ code: "custom", path: [field], message: "Unsupported profile field" });
    if (
      !z
        .union([
          z.string().max(20000),
          z.array(z.string().max(500)).max(300),
          z.number().finite(),
          z.null(),
        ])
        .safeParse(value).success
    )
      context.addIssue({
        code: "custom",
        path: [field],
        message: "Use a string, number, list of strings, or null",
      });
  }
});
export const optionalUrl = z.union([
  z.literal(""),
  z
    .url()
    .refine(
      (url) => ["http:", "https:"].includes(new URL(url).protocol),
      "Use an http or https URL",
    ),
]);
export const listFromText = (value: string) => [
  ...new Set(
    value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];
export const linesFromText = (value: string) => [
  ...new Set(
    value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];

export const discoverySchema = z
  .object({
    roles: z.array(z.string().min(1)).min(1, "Add at least one desired role"),
    locations: z.array(z.string()).default([]),
    experienceMin: z.number().min(0).max(70).optional(),
    experienceMax: z.number().min(0).max(70).optional(),
    sources: z.array(z.string()).min(1, "Select at least one source"),
    freshnessDays: z.number().int().min(1).max(365),
    maxResults: z.number().int().min(1).max(100),
    requiredKeywords: z.array(z.string()).default([]),
    excludedKeywords: z.array(z.string()).default([]),
    companies: z.array(z.string()).default([]),
    notes: z.string().max(10000).default(""),
  })
  .refine(
    (value) =>
      value.experienceMin === undefined ||
      value.experienceMax === undefined ||
      value.experienceMin <= value.experienceMax,
    { message: "Minimum experience cannot exceed maximum experience", path: ["experienceMax"] },
  );

export const resultSchema = z.object({
  status: z.enum(["WAITING_FOR_USER", "READY_FOR_REVIEW", "COMPLETED", "FAILED"]),
  summary: z.string().trim().min(1, "Describe the result").max(20000),
  resultUrl: optionalUrl,
  resumeVersionId: z.union([z.literal(""), z.uuid()]),
  unknownQuestions: z.array(z.string().trim().min(1)).max(100),
  notes: z.string().max(20000),
  evidenceUrls: z
    .array(z.url().refine((url) => ["http:", "https:"].includes(new URL(url).protocol)))
    .max(50),
  applicationStage: z.enum([
    "",
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
  ]),
  humanConfirmed: z.boolean(),
  structuredResult: jsonRecord,
  profileState: profileStateSchema,
  approvedProfileFields: z.array(z.string()),
  contact: z
    .object({
      name: z.string().trim().min(1).max(300),
      title: z.string().max(300),
      company: z.string().trim().min(1).max(300),
      email: z.union([z.literal(""), z.email()]),
      linkedinUrl: optionalUrl,
      source: z
        .string()
        .trim()
        .min(1, "Record the public or manual verification source for the contact")
        .max(1000),
      verificationStatus: z.enum([
        "UNKNOWN",
        "VALID",
        "INVALID",
        "ACCEPT_ALL",
        "UNVERIFIED",
        "MANUAL_VERIFIED",
      ]),
      notes: z.string().max(20000),
    })
    .optional(),
});
export type MissionResult = z.infer<typeof resultSchema>;

export const terminalStatuses = new Set<MissionStatus>(["COMPLETED", "FAILED", "CANCELLED"]);
export function assertMissionEditable(status: MissionStatus) {
  if (terminalStatuses.has(status))
    throw new Error("This mission is closed. Create a new mission to record another attempt.");
}
export function validateResult(currentStatus: MissionStatus, input: MissionResult): MissionResult {
  assertMissionEditable(currentStatus);
  const result = resultSchema.parse(input);
  if (result.applicationStage === "APPLIED" && !result.humanConfirmed)
    throw new Error(
      "Marking APPLIED requires explicit confirmation that a human approved final submission.",
    );
  if (result.unknownQuestions.length > 0) {
    if (result.applicationStage && !["DRAFT", "PREPARING"].includes(result.applicationStage))
      throw new Error(
        "Resolve unknown questions before recording a reviewed or submitted application.",
      );
    return { ...result, status: "WAITING_FOR_USER" };
  }
  return result;
}

export function profileDiff(known: JsonRecord, target: JsonRecord) {
  return computeProfileDiff(known, target).filter((item) =>
    (PROFILE_FIELDS as readonly string[]).includes(item.field),
  );
}
export function applyExplicitProfileResult(
  known: JsonRecord,
  target: JsonRecord,
  observed: JsonRecord,
  approvedFields: string[],
) {
  const approved = new Set(approvedFields);
  if (Object.keys(observed).some((field) => !(PROFILE_FIELDS as readonly string[]).includes(field)))
    throw new Error("Profile result includes an unsupported field.");
  for (const [field, value] of Object.entries(observed))
    if (
      value === null ||
      value === "" ||
      (typeof value === "string" && value.trim().toUpperCase() === "UNKNOWN") ||
      (Array.isArray(value) &&
        value.some((item) => typeof item === "string" && item.trim().toUpperCase() === "UNKNOWN"))
    )
      throw new Error(`Do not submit unknown profile data: ${field}`);
  const changed = profileDiff(known, observed);
  for (const item of changed) {
    if (!approved.has(item.field))
      throw new Error(`Explicitly approve the profile field: ${item.field}`);
    if (
      !Object.hasOwn(target, item.field) ||
      JSON.stringify(target[item.field]) !== JSON.stringify(item.target)
    )
      throw new Error(
        `Observed ${item.field} differs from the approved target. Update the target before recording it.`,
      );
  }
  return { state: { ...known, ...observed }, changes: changed };
}

function pick(value: JsonRecord | null | undefined, keys: readonly string[]) {
  return Object.fromEntries(
    keys
      .filter((key) => value && Object.hasOwn(value, key))
      .map((key) => [key, value?.[key] ?? "UNKNOWN"]),
  );
}
const applicationCandidateFields = [
  "fullName",
  "preferredName",
  "primaryEmail",
  "phone",
  "currentCity",
  "country",
  "yearsOfExperience",
  "currentCompany",
  "currentRole",
  "noticePeriod",
  "lastWorkingDay",
  "preferredLocations",
  "remotePreference",
  "desiredRoles",
  "linkedinUrl",
  "githubUrl",
  "portfolioUrl",
  "careerSummary",
  "workAuthorizationAnswers",
  "sponsorshipAnswers",
  "relocationPreference",
  "standardApplicationAnswers",
  "standardAnswers",
  "workAuthorization",
  "sponsorship",
];
const profileCandidateFields = [
  "currentRole",
  "yearsOfExperience",
  "careerSummary",
  "noticePeriod",
  "preferredLocations",
  "desiredRoles",
];
export function candidateForMission(
  type: MissionType,
  candidate: JsonRecord | null | undefined,
  input: JsonRecord = {},
): JsonRecord {
  if (type === "DISCOVER_JOBS")
    return pick(input, [
      "roles",
      "locations",
      "experienceMin",
      "experienceMax",
      "sources",
      "freshnessDays",
      "maxResults",
      "requiredKeywords",
      "excludedKeywords",
      "companies",
      "remotePreference",
    ]);
  if (type === "APPLY_JOB" || type === "PREPARE_APPLICATION")
    return pick(candidate, applicationCandidateFields);
  if (type === "UPDATE_PROFILE" || type === "INSPECT_PROFILE")
    return pick(candidate, profileCandidateFields);
  return {};
}

export function buildMissionContext(input: {
  mission: {
    id: string;
    type: MissionType;
    status: MissionStatus;
    title: string;
    goal: string;
    priority: unknown;
    entityType: string;
    entityId: string | null;
    constraints: JsonRecord;
    input: JsonRecord;
    expectedResult: JsonRecord;
  };
  candidate?: JsonRecord | null;
  entity?: JsonRecord | null;
  application?: JsonRecord | null;
  job?: JsonRecord | null;
  resume?: {
    id: string;
    versionLabel: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    resumeName?: string;
  } | null;
  steps: {
    sequence: number;
    title: string;
    instruction: string;
    status: string;
    requiresApproval: boolean;
  }[];
  baseUrl?: string;
}) {
  const base = input.baseUrl ?? "";
  const { mission } = input;
  const entityFields =
    mission.entityType === "JOB"
      ? [
          "id",
          "company",
          "title",
          "location",
          "workMode",
          "canonicalUrl",
          "source",
          "status",
          "description",
          "requirements",
          "skills",
        ]
      : mission.entityType === "PROFILE"
        ? ["id", "provider", "displayName", "profileUrl", "knownState", "targetState"]
        : mission.entityType === "APPLICATION"
          ? ["id", "jobId", "resumeVersionId", "status", "applicationUrl"]
          : mission.entityType === "CONTACT"
            ? [
                "id",
                "name",
                "company",
                "title",
                "email",
                "linkedinUrl",
                "source",
                "verificationStatus",
              ]
            : [];
  const entityData = pick(input.entity, entityFields);
  if (mission.entityType === "PROFILE")
    for (const field of ["knownState", "targetState"]) {
      if (entityData[field] && typeof entityData[field] === "object")
        entityData[field] = pick(entityData[field] as JsonRecord, PROFILE_FIELDS);
    }
  return {
    mission: pick(mission as unknown as JsonRecord, ["id", "type", "title", "status", "priority"]),
    goal: mission.goal,
    entity: { type: mission.entityType, id: mission.entityId, data: entityData },
    ...(input.application
      ? {
          application: pick(input.application, [
            "id",
            "jobId",
            "resumeVersionId",
            "status",
            "applicationUrl",
          ]),
        }
      : {}),
    ...(input.job
      ? { job: pick(input.job, ["id", "company", "title", "location", "canonicalUrl", "source"]) }
      : {}),
    input: {
      ...mission.input,
      ...(mission.input.profileKnownState && typeof mission.input.profileKnownState === "object"
        ? { profileKnownState: pick(mission.input.profileKnownState as JsonRecord, PROFILE_FIELDS) }
        : {}),
      ...(mission.input.profileTargetState && typeof mission.input.profileTargetState === "object"
        ? {
            profileTargetState: pick(
              mission.input.profileTargetState as JsonRecord,
              PROFILE_FIELDS,
            ),
          }
        : {}),
    },
    candidate: candidateForMission(mission.type, input.candidate, mission.input),
    selectedResume:
      input.resume && mission.type !== "DISCOVER_JOBS"
        ? {
            ...input.resume,
            downloadUrl: `${base}/api/resumes/${input.resume.id}/file?download=1`,
            previewUrl: `${base}/api/resumes/${input.resume.id}/file`,
          }
        : null,
    constraints: mission.constraints,
    steps: input.steps,
    approvalRequirements: input.steps
      .filter((step) => step.requiresApproval)
      .map((step) => step.title),
    successCriteria: mission.expectedResult.successCriteria ?? [],
    expectedResultSchema: mission.expectedResult,
    resultUrl: `${base}/missions/${mission.id}/result`,
    contextUrl: `${base}/missions/${mission.id}/context.json`,
    relatedLinks: {
      mission: `${base}/missions/${mission.id}`,
      jobsImport: `${base}/import/jobs`,
      ...(mission.entityId &&
      ["JOB", "PROFILE", "APPLICATION", "CONTACT"].includes(mission.entityType)
        ? {
            entity: `${base}/${({ JOB: "jobs", PROFILE: "profiles", APPLICATION: "applications", CONTACT: "contacts" } as Record<string, string>)[mission.entityType]}/${mission.entityId}`,
          }
        : {}),
    },
  };
}
