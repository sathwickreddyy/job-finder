import "dotenv/config";
import { and, desc, eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db, closeDatabase } from "../src/db";
import {
  activityLogs,
  applicationEvents,
  applications,
  candidateProfiles,
  contacts,
  jobResumeMatches,
  jobs,
  jobSnapshots,
  mailEvents,
  mailMessages,
  missionEvidence,
  missionExecutions,
  missions,
  missionSteps,
  profiles,
  resumes,
  resumeVersions,
  settings,
} from "../src/db/schema";
import { putBuffer, removeFile } from "../src/services/storage";
import { extractPdfText } from "../src/services/pdf";
import { compareKeywords, extractKeywords } from "../src/services/keywords";
import { jobDedupeKey } from "../src/features/jobs/import";
import { missionTemplate } from "../src/features/missions/templates";

// Fictional fixtures belong only to the marked, isolated integration-test database.
const fixtureDatabase = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (
  fixtureDatabase.pathname !== "/jobops_e2e" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(fixtureDatabase.hostname)
)
  throw new Error("Test fixtures can only be installed in the local jobops_e2e database.");
const [fixtureMarker] = await db.select().from(settings).where(eq(settings.key, "__jobops_e2e"));
if (fixtureMarker?.value.ownedBy !== "jobops-browser-tests") {
  await closeDatabase();
  throw new Error("The isolated database must have the JobOps browser-test ownership marker.");
}

const stableId = (number: number) =>
  `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000);
const daysAhead = (days: number) => new Date(now.getTime() + days * 86400000);

function renameLegacyKey(record: Record<string, unknown>, legacy: string, canonical: string) {
  if (Object.hasOwn(record, canonical) || !Object.hasOwn(record, legacy)) return undefined;
  const next = { ...record, [canonical]: record[legacy] };
  delete next[legacy];
  return next;
}

async function normalizeDemoReferences() {
  await db.transaction(async (tx) => {
    const changes: { entityType: string; entityId: string; fields: string[] }[] = [];
    const [mission] = await tx
      .select()
      .from(missions)
      .where(eq(missions.id, stableId(501)))
      .for("update");
    if (mission) {
      const input = renameLegacyKey(mission.input, "resumeVersionId", "selectedResumeVersionId");
      if (input) {
        await tx
          .update(missions)
          .set({ input, updatedAt: new Date() })
          .where(eq(missions.id, mission.id));
        changes.push({
          entityType: "MISSION",
          entityId: mission.id,
          fields: ["selectedResumeVersionId"],
        });
      }
    }
    for (const profileId of [stableId(400), stableId(401)]) {
      const [profile] = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.id, profileId))
        .for("update");
      if (!profile) continue;
      const knownState = renameLegacyKey(profile.knownState, "resume", "currentResumeIdentifier");
      const targetState = renameLegacyKey(profile.targetState, "resume", "currentResumeIdentifier");
      if (knownState || targetState) {
        await tx
          .update(profiles)
          .set({
            ...(knownState ? { knownState } : {}),
            ...(targetState ? { targetState } : {}),
            updatedAt: new Date(),
          })
          .where(eq(profiles.id, profile.id));
        changes.push({
          entityType: "PROFILE",
          entityId: profile.id,
          fields: [
            knownState ? "knownState.currentResumeIdentifier" : "",
            targetState ? "targetState.currentResumeIdentifier" : "",
          ].filter(Boolean),
        });
      }
    }
    if (changes.length)
      await tx.insert(activityLogs).values({
        action: "DEMO_REFERENCES_NORMALIZED",
        entityType: "SYSTEM",
        summary:
          "Renamed legacy demo resume reference keys; existing canonical values and other data were preserved.",
        metadata: { changes, isDemo: true },
      });
  });
}

const familyData = [
  {
    name: "Demo Backend Senior",
    slug: "demo-backend-senior",
    category: "Backend Engineering",
    description: "Fictional example for API and distributed-systems roles.",
    terms: [
      "Python",
      "Java",
      "Spring Boot",
      "FastAPI",
      "PostgreSQL",
      "Kafka",
      "Redis",
      "AWS",
      "Docker",
      "Distributed systems",
      "REST",
      "Unit testing",
      "Mentoring",
    ],
  },
  {
    name: "Demo Platform Engineering",
    slug: "demo-platform-engineering",
    category: "Platform Engineering",
    description: "Fictional example for infrastructure and reliability roles.",
    terms: [
      "Go",
      "AWS",
      "Kubernetes",
      "Docker",
      "Terraform",
      "Linux",
      "CI/CD",
      "Prometheus",
      "Grafana",
      "Observability",
      "gRPC",
      "SRE",
      "Technical leadership",
    ],
  },
  {
    name: "Demo Data Platform",
    slug: "demo-data-platform",
    category: "Data Engineering",
    description: "Fictional example for data pipelines and analytics platforms.",
    terms: [
      "Python",
      "SQL",
      "Snowflake",
      "Kafka",
      "Airflow",
      "dbt",
      "Spark",
      "AWS",
      "PostgreSQL",
      "ETL",
      "Data pipelines",
      "Data engineering",
      "Mentoring",
    ],
  },
];
const jobData = [
  {
    company: "Orbit Ledger (Demo)",
    title: "Senior Backend Engineer",
    location: "Bengaluru",
    source: "COMPANY_CAREERS",
    terms: "Python FastAPI PostgreSQL Kafka AWS distributed systems",
    status: "SHORTLISTED" as const,
  },
  {
    company: "Harbor Compute (Demo)",
    title: "Staff Platform Engineer",
    location: "Remote",
    source: "LINKEDIN",
    terms: "Go Kubernetes Docker Terraform AWS Prometheus technical leadership",
    status: "PREPARING" as const,
  },
  {
    company: "Northstar Data (Demo)",
    title: "Senior Data Engineer",
    location: "Hyderabad",
    source: "NAUKRI",
    terms: "Python SQL Snowflake Airflow dbt data pipelines",
    status: "APPLIED" as const,
  },
  {
    company: "Signal Grove (Demo)",
    title: "Backend Engineering Lead",
    location: "Bengaluru",
    source: "INSTAHYRE",
    terms: "Java Spring Boot Kafka PostgreSQL distributed systems mentoring",
    status: "NEW" as const,
  },
  {
    company: "Copper Kite (Demo)",
    title: "Senior Full Stack Engineer",
    location: "Pune",
    source: "WELLFOUND",
    terms: "TypeScript React Node.js PostgreSQL Playwright",
    status: "NEW" as const,
  },
  {
    company: "Aurora Works (Demo)",
    title: "Platform Backend Developer",
    location: "Remote",
    source: "COMPANY_CAREERS",
    terms: "Go Redis gRPC AWS Docker API design",
    status: "REVIEWING" as const,
  },
  {
    company: "Tidal Circuit (Demo)",
    title: "Senior Software Engineer",
    location: "Chennai",
    source: "CUTSHORT",
    terms: "Python FastAPI Kafka AWS unit testing REST",
    status: "APPLIED" as const,
  },
  {
    company: "Pixel Forge (Demo)",
    title: "Infrastructure Engineer",
    location: "Remote",
    source: "COMPANY_CAREERS",
    terms: "Kubernetes Terraform Grafana Prometheus Linux observability",
    status: "IGNORED" as const,
  },
];

async function createDemoPdf(title: string, terms: string[], label: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${title} - ${label} - fictional sample`);
  doc.setAuthor("JobOps fictional demo");
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const heading = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText("DEMO CANDIDATE", {
    x: 48,
    y: 780,
    size: 22,
    font: heading,
    color: rgb(0.08, 0.2, 0.33),
  });
  page.drawText(`${title} | ${label}`, { x: 48, y: 752, size: 13, font: heading });
  const lines = [
    "Fictional sample resume. Replace before using in a real application.",
    "demo.candidate@example.invalid | Bengaluru, India",
    "",
    "SUMMARY",
    "Software engineer with fictional experience building reliable platforms.",
    "Designed APIs, collaborated across teams, and mentored engineers.",
    "",
    "TECHNOLOGIES AND PRACTICES",
    ...terms.reduce<string[]>((rows, term) => {
      const last = rows[rows.length - 1];
      if (last && `${last}, ${term}`.length <= 78) rows[rows.length - 1] = `${last}, ${term}`;
      else rows.push(term);
      return rows;
    }, []),
    "",
    "FICTIONAL EXPERIENCE",
    "Example Systems - Software Engineer - 2020 to 2026",
    "Built services and operational workflows using the technologies above.",
    "Reviewed designs, wrote unit tests and supported production operations.",
    "",
    "EDUCATION",
    "Fictional University - Bachelor of Engineering",
  ];
  lines.forEach((line, index) =>
    page.drawText(line, { x: 48, y: 718 - index * 20, size: 10, font }),
  );
  return Buffer.from(await doc.save());
}

async function seed() {
  const [existingCandidate] = await db
    .select({ id: candidateProfiles.id })
    .from(candidateProfiles)
    .limit(1);
  if (!existingCandidate)
    await db
      .insert(candidateProfiles)
      .values({
        id: stableId(1),
        fullName: "Demo Candidate",
        preferredName: "Demo",
        primaryEmail: "demo.candidate@example.invalid",
        currentCity: "Bengaluru",
        country: "India",
        yearsOfExperience: 6,
        currentCompany: "Example Systems (Fictional)",
        currentRole: "Software Engineer",
        preferredLocations: ["Bengaluru", "Hyderabad", "Remote"],
        desiredRoles: ["Senior Backend Engineer", "Platform Engineer"],
        remotePreference: "HYBRID_OR_REMOTE",
        workAuthorization: "UNKNOWN",
        sponsorship: "UNKNOWN",
        relocationPreference: "UNKNOWN",
        noticePeriod: "UNKNOWN",
        careerSummary:
          "Fictional demo candidate. Replace these details with your own canonical information.",
        standardAnswers: {
          "Are you authorized to work in India?": "UNKNOWN",
          "Do you require sponsorship?": "UNKNOWN",
          "What is your notice period?": "UNKNOWN",
        },
        metadata: { isDemo: true },
      })
      .onConflictDoNothing();

  const versionIds: string[] = [];
  for (let index = 0; index < familyData.length; index++) {
    const family = familyData[index];
    const resumeId = stableId(10 + index);
    await db
      .insert(resumes)
      .values({
        id: resumeId,
        name: family.name,
        slug: family.slug,
        category: family.category,
        description: family.description,
      })
      .onConflictDoNothing();
    for (let versionNumber = 1; versionNumber <= 2; versionNumber++) {
      const versionId = stableId(20 + index * 2 + versionNumber - 1);
      if (versionNumber === 2) versionIds.push(versionId);
      const [existing] = await db
        .select({ id: resumeVersions.id })
        .from(resumeVersions)
        .where(eq(resumeVersions.id, versionId));
      if (existing) continue;
      const terms = versionNumber === 1 ? family.terms.slice(0, -3) : family.terms;
      const bytes = await createDemoPdf(family.name, terms, `v${versionNumber}`);
      const stored = await putBuffer(bytes, { namespace: "resumes", extension: "pdf" });
      try {
        const extractedText = await extractPdfText(bytes);
        const [current] = await db
          .select({ id: resumeVersions.id })
          .from(resumeVersions)
          .where(and(eq(resumeVersions.resumeId, resumeId), eq(resumeVersions.isCurrent, true)));
        await db
          .insert(resumeVersions)
          .values({
            id: versionId,
            resumeId,
            versionLabel: `Demo v${versionNumber}`,
            originalFilename: `${family.slug}-v${versionNumber}.pdf`,
            ...stored,
            extractedText,
            keywords: extractKeywords(extractedText),
            skills: terms,
            experienceTags: ["Fictional demo"],
            parsingStatus: "COMPLETED",
            isCurrent: versionNumber === 2 && !current,
            createdAt: daysAgo(3 - versionNumber),
          })
          .onConflictDoNothing();
      } catch (error) {
        await removeFile(stored.storagePath);
        throw error;
      }
    }
  }

  for (let index = 0; index < jobData.length; index++) {
    const job = jobData[index];
    const jobId = stableId(100 + index);
    const description = `${job.company} seeks a ${job.title}. Requirements: ${job.terms}. This is a fictional demo role for learning JobOps. Do not apply to example.invalid.`;
    await db
      .insert(jobs)
      .values({
        id: jobId,
        company: job.company,
        title: job.title,
        location: job.location,
        source: job.source,
        canonicalUrl: `https://careers.example.invalid/jobs/demo-${index + 1}`,
        dedupeKey: jobDedupeKey(job),
        experienceMin: 4,
        experienceMax: 8,
        workMode: job.location === "Remote" ? "REMOTE" : "HYBRID",
        postedAt: daysAgo(index % 4),
        status: job.status,
        notes: "Clearly marked fictional demo data.",
      })
      .onConflictDoNothing();
    const skills = extractKeywords(job.terms);
    await db
      .insert(jobSnapshots)
      .values({
        id: stableId(200 + index),
        jobId,
        description,
        requirements: [`4-8 years experience`, `Practical knowledge of ${job.terms}`],
        skills,
        rawText: description,
        metadata: { isDemo: true },
      })
      .onConflictDoNothing();
    const [latestSnapshot] = await db
      .select({ skills: jobSnapshots.skills })
      .from(jobSnapshots)
      .where(eq(jobSnapshots.jobId, jobId))
      .orderBy(desc(jobSnapshots.capturedAt))
      .limit(1);
    for (const versionId of versionIds) {
      const [version] = await db
        .select({ keywords: resumeVersions.keywords })
        .from(resumeVersions)
        .where(eq(resumeVersions.id, versionId));
      if (!version) continue;
      const match = compareKeywords(latestSnapshot?.skills ?? skills, version.keywords);
      await db
        .insert(jobResumeMatches)
        .values({
          jobId,
          resumeVersionId: versionId,
          score: match.score,
          matchedKeywords: match.matched,
          missingKeywords: match.missing,
        })
        .onConflictDoNothing();
    }
  }

  const applicationData = [
    {
      jobIndex: 1,
      versionIndex: 1,
      status: "READY_FOR_REVIEW" as const,
      note: "Prepared demo application. Requires explicit review before submission.",
    },
    {
      jobIndex: 2,
      versionIndex: 2,
      status: "ACKNOWLEDGED" as const,
      note: "Fictional acknowledgement; follow up after review.",
    },
    {
      jobIndex: 6,
      versionIndex: 0,
      status: "TECHNICAL_INTERVIEW" as const,
      note: "Fictional interview next week. Prepare system design notes.",
    },
  ];
  for (let index = 0; index < applicationData.length; index++) {
    const item = applicationData[index];
    const applicationId = stableId(300 + index);
    await db
      .insert(applications)
      .values({
        id: applicationId,
        jobId: stableId(100 + item.jobIndex),
        resumeVersionId: versionIds[item.versionIndex],
        status: item.status,
        source: "DEMO",
        applicationUrl: `https://careers.example.invalid/applications/demo-${index + 1}`,
        notes: item.note,
        appliedAt: index ? daysAgo(4) : null,
        nextActionAt: index === 1 ? daysAgo(1) : daysAhead(index + 1),
      })
      .onConflictDoNothing();
    await db
      .insert(applicationEvents)
      .values({
        id: stableId(310 + index),
        applicationId,
        eventType: "APPLICATION_CREATED",
        source: "DEMO",
        summary: "Fictional application created for demonstration.",
        payload: { isDemo: true, stage: item.status },
        occurredAt: daysAgo(5),
      })
      .onConflictDoNothing();
    if (index)
      await db
        .insert(applicationEvents)
        .values({
          id: stableId(320 + index),
          applicationId,
          eventType: index === 1 ? "ACKNOWLEDGEMENT_RECEIVED" : "INTERVIEW_SCHEDULED",
          source: "DEMO",
          summary:
            index === 1
              ? "Fictional acknowledgement recorded."
              : "Fictional technical interview scheduled.",
          payload: { isDemo: true },
          occurredAt: daysAgo(1),
        })
        .onConflictDoNothing();
  }

  await db
    .insert(profiles)
    .values([
      {
        id: stableId(400),
        provider: "NAUKRI",
        displayName: "Demo Naukri Profile",
        profileUrl: "https://www.naukri.com/mnjuser/profile",
        lastInspectedAt: daysAgo(21),
        knownState: {
          headline: "Software Engineer",
          skills: ["Python", "Java"],
          currentResumeIdentifier: "demo-backend-v1",
        },
        targetState: {
          headline: "Senior Backend Engineer | Python | Java | Distributed Systems",
          skills: ["Python", "Java", "Kafka", "PostgreSQL"],
          currentResumeIdentifier: "demo-backend-v2",
        },
        notes: "Fictional observed state. Replace after a real inspection.",
      },
      {
        id: stableId(401),
        provider: "LINKEDIN",
        displayName: "Demo LinkedIn Profile",
        profileUrl: "https://www.linkedin.com/in/demo-candidate/",
        lastInspectedAt: daysAgo(7),
        knownState: { headline: "Software Engineer", skills: ["Python"] },
        targetState: {
          headline: "Backend & Platform Engineer",
          skills: ["Python", "Distributed systems"],
        },
        notes: "Fictional example profile.",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(contacts)
    .values({
      id: stableId(450),
      company: jobData[0].company,
      name: "Alex Example (Demo)",
      title: "Engineering Recruiter",
      email: "alex@example.invalid",
      source: "Fictional seed data",
      verificationStatus: "UNKNOWN",
      notes: "Fictional contact. Never send mail to this address.",
    })
    .onConflictDoNothing();

  const discovery = missionTemplate("DISCOVER_JOBS");
  const apply = missionTemplate("APPLY_JOB", `${jobData[1].company} — ${jobData[1].title}`);
  const inspection = missionTemplate("INSPECT_PROFILE", "Demo Naukri Profile");
  const missionData = [
    {
      id: stableId(500),
      type: "DISCOVER_JOBS" as const,
      template: discovery,
      entityType: "NONE",
      entityId: null,
      status: "READY" as const,
      input: {
        desiredRoles: ["Senior Backend Engineer", "Platform Engineer"],
        locations: ["Bengaluru", "Remote"],
        experienceMin: 4,
        experienceMax: 8,
        sources: ["COMPANY_CAREERS", "NAUKRI", "LINKEDIN"],
        maximumResults: 20,
        freshness: "7 days",
      },
    },
    {
      id: stableId(501),
      type: "APPLY_JOB" as const,
      template: apply,
      entityType: "JOB",
      entityId: stableId(101),
      status: "READY_FOR_REVIEW" as const,
      input: { selectedResumeVersionId: versionIds[1], applicationId: stableId(300) },
    },
    {
      id: stableId(502),
      type: "INSPECT_PROFILE" as const,
      template: inspection,
      entityType: "PROFILE",
      entityId: stableId(400),
      status: "DRAFT" as const,
      input: {},
    },
  ];
  for (let index = 0; index < missionData.length; index++) {
    const mission = missionData[index];
    await db
      .insert(missions)
      .values({
        id: mission.id,
        type: mission.type,
        title: `${mission.template.title} (Demo)`,
        goal: mission.template.goal,
        entityType: mission.entityType,
        entityId: mission.entityId,
        status: mission.status,
        priority: 2,
        input: { ...mission.input, isDemo: true },
        constraints: mission.template.constraints,
        expectedResult: mission.template.expectedResult,
        createdBy: "HUMAN",
      })
      .onConflictDoNothing();
    for (let sequence = 0; sequence < mission.template.steps.length; sequence++) {
      const step = mission.template.steps[sequence];
      await db
        .insert(missionSteps)
        .values({
          id: stableId(600 + index * 20 + sequence),
          missionId: mission.id,
          sequence: sequence + 1,
          ...step,
        })
        .onConflictDoNothing();
    }
  }
  await db
    .insert(missionExecutions)
    .values({
      id: stableId(700),
      missionId: stableId(501),
      operator: "HUMAN",
      status: "READY_FOR_REVIEW",
      startedAt: daysAgo(1),
      notes: "Fictional preparation stopped before final submission.",
    })
    .onConflictDoNothing();
  await db
    .insert(missionEvidence)
    .values({
      id: stableId(701),
      missionId: stableId(501),
      executionId: stableId(700),
      type: "NOTE",
      value:
        "Demo application prepared without submission. Review candidate UNKNOWN answers first.",
      metadata: { isDemo: true, applicationStage: "READY_FOR_REVIEW" },
    })
    .onConflictDoNothing();

  const demoMail = [
    {
      id: stableId(800),
      externalId: "demo-ack-1",
      sender: "recruiting@example.invalid",
      senderName: "Northstar Data (Demo)",
      subject: "Thank you for applying — Senior Data Engineer",
      snippet: "We received your application and our recruiting team will review it.",
      bodyText:
        "Thank you for applying. We received your application for Senior Data Engineer at Northstar Data (Demo).",
      classification: "APPLICATION_ACKNOWLEDGEMENT" as const,
      linkedApplicationId: stableId(301),
    },
    {
      id: stableId(801),
      externalId: "demo-interview-1",
      sender: "interviews@example.invalid",
      senderName: "Tidal Circuit (Demo)",
      subject: "Technical interview availability",
      snippet: "Please share your interview availability for next week.",
      bodyText:
        "Please share your availability for a technical interview for Senior Software Engineer. This is fictional demo mail.",
      classification: "INTERVIEW" as const,
      linkedApplicationId: stableId(302),
    },
    {
      id: stableId(802),
      externalId: "demo-outreach-1",
      sender: "alex@example.invalid",
      senderName: "Alex Example (Demo)",
      subject: "An engineering opportunity",
      snippet: "Our recruiting team would like to connect about a backend role.",
      bodyText: "Our recruiting team has a backend opportunity. Fictional sample only.",
      classification: "RECRUITER_OUTREACH" as const,
      linkedApplicationId: null,
    },
  ];
  for (let index = 0; index < demoMail.length; index++) {
    const message = demoMail[index];
    await db
      .insert(mailMessages)
      .values({
        ...message,
        provider: "DEMO",
        recipient: "demo.candidate@example.invalid",
        receivedAt: daysAgo(index),
      })
      .onConflictDoNothing();
    await db
      .insert(mailEvents)
      .values({
        id: stableId(810 + index),
        mailMessageId: message.id,
        type: message.classification,
        confidence: index === 2 ? 0.65 : 0.96,
        linkedApplicationId: message.linkedApplicationId,
        status: "NEEDS_REVIEW",
        details: {
          isDemo: true,
          reason:
            "Fictional deterministic phrase match; review required before any application update.",
        },
      })
      .onConflictDoNothing();
  }

  await db
    .insert(settings)
    .values([
      {
        key: "jobPreferences",
        value: {
          desiredRoles: ["Senior Backend Engineer", "Platform Engineer"],
          locations: ["Bengaluru", "Hyderabad", "Remote"],
          minExperience: 4,
          maxExperience: 8,
          preferredTechnologies: ["Python", "Java", "Kafka", "PostgreSQL"],
          excludedRoles: ["Intern"],
          remotePreference: "HYBRID_OR_REMOTE",
        },
      },
      {
        key: "missionDefaults",
        value: {
          stopBeforeSubmission: true,
          stopOnUnknown: true,
          maximumResults: 20,
          defaultOperator: "HUMAN",
        },
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(activityLogs)
    .values({
      id: stableId(900),
      action: "DEMO_SEEDED",
      entityType: "SYSTEM",
      summary:
        "Created fictional JobOps demo data. Replace canonical candidate details before real use.",
      metadata: { isDemo: true },
    })
    .onConflictDoNothing();
  await normalizeDemoReferences();
  console.log(
    "JobOps fictional demo seed ready: 3 resume families, 6 real PDFs, 8 jobs, applications, profiles, missions and mail. Existing data was preserved.",
  );
}

seed()
  .finally(closeDatabase)
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Seeding failed.");
    process.exitCode = 1;
  });
