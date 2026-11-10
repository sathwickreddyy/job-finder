import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activityLogs, applicationRounds, applications, jobs } from "@/db/schema";
import { ApiError, refusal } from "@/features/agent-api/http";
import { notPreviousJob } from "@/features/companies/previous-job";
import { day } from "./agent-record";
import { outcomeDetailsSchema, readOutcomeDetails } from "./outcome-input";
import {
  applyOutcome,
  closeUnsentRecord,
  isNotApplyingEvent,
  markRecordSent,
  recordEvidence,
  reopenUnsentRecord,
  type Tx,
} from "./outcome-service";
import {
  availableOutcomes,
  canEditPlannedRecord,
  outcomeIds,
  outcomeMeta,
  phaseOf,
  recordStateFrom,
} from "./phase";

const requestId = z.uuid();
const transitionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("recordSent"),
    requestId,
    sentDate: day,
    humanConfirmed: z.literal(true),
  }),
  z.strictObject({ action: z.literal("notApplying"), requestId }),
  z.strictObject({ action: z.literal("reopen"), requestId }),
  z.strictObject({
    action: z.literal("recordOutcome"),
    requestId,
    outcome: z.enum(outcomeIds),
    details: outcomeDetailsSchema.optional(),
  }),
]);

async function findRecord(tx: Tx, id: string, lock = false) {
  const query = tx
    .select({ app: applications })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(eq(applications.id, id), notPreviousJob));
  const [row] = await (lock ? query.for("update", { of: applications }) : query);
  if (!row) throw new ApiError("Application not found.", 404);
  return row.app;
}

async function snapshot(tx: Tx, app: typeof applications.$inferSelect) {
  const rounds = await tx
    .select()
    .from(applicationRounds)
    .where(eq(applicationRounds.applicationId, app.id))
    .orderBy(asc(applicationRounds.position));
  const evidence = await recordEvidence(tx, app.id);
  const state = recordStateFrom({ ...app, ...evidence }, rounds, []);
  const phase = phaseOf(state);
  const outcomes = availableOutcomes(state);
  const actions: z.infer<typeof transitionSchema>["action"][] = [];
  if (canEditPlannedRecord(state)) actions.push("recordSent", "notApplying");
  if (outcomes.length) actions.push("recordOutcome");
  if (app.status === "CLOSED" && app.closedReason === "WITHDREW" && !state.sent) {
    const closing = evidence.events
      .filter((event) => event.eventType === "WITHDRAWN")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (closing && isNotApplyingEvent(closing)) actions.push("reopen");
  }
  return {
    id: app.id,
    status: app.status,
    phase,
    sent: state.sent,
    closedReason: app.closedReason,
    availableActions: actions,
    availableOutcomes: outcomes.map((id) => ({ id, ...outcomeMeta[id] })),
  };
}

export async function readApplicationTransitions(id: string) {
  return db.transaction(
    async (tx) => ({ application: await snapshot(tx, await findRecord(tx, id)) }),
    {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    },
  );
}

export async function transitionApplication(id: string, input: unknown, now = new Date()) {
  const { requestId, ...command } = transitionSchema.parse(input);
  const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  try {
    return await db.transaction(async (tx) => {
      // The application lock serializes receipts with both API and portal writes.
      const app = await findRecord(tx, id, true);
      const receiptKey = {
        action: "APPLICATION_API_TRANSITION",
        entityType: "APPLICATION",
        entityId: id,
      };
      const [receipt] = await tx
        .select({ metadata: activityLogs.metadata })
        .from(activityLogs)
        .where(
          and(
            eq(activityLogs.action, receiptKey.action),
            eq(activityLogs.entityId, id),
            sql`${activityLogs.metadata}->>'requestId' = ${requestId}`,
          ),
        )
        .limit(1);
      if (receipt) {
        if (receipt.metadata.fingerprint !== fingerprint)
          throw new ApiError("This requestId was already used for a different transition.", 409);
        return { replayed: true, application: await snapshot(tx, app) };
      }

      switch (command.action) {
        case "recordSent":
          await markRecordSent(tx, { ...command, id }, now);
          break;
        case "notApplying":
          await closeUnsentRecord(tx, { id }, now);
          break;
        case "reopen":
          await reopenUnsentRecord(tx, { id }, now);
          break;
        case "recordOutcome":
          await applyOutcome(
            tx,
            {
              applicationId: id,
              outcome: command.outcome,
              detail: readOutcomeDetails(command.details, now),
            },
            now,
          );
          break;
      }
      await tx.insert(activityLogs).values({
        ...receiptKey,
        summary: `Recorded application transition through the API (${command.action})`,
        metadata: { requestId, fingerprint },
      });
      return { replayed: false, application: await snapshot(tx, await findRecord(tx, id)) };
    });
  } catch (error) {
    throw refusal(error);
  }
}
