import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  activityLogs,
  applicationEvents,
  applications,
  mailClassifications,
  mailEvents,
  mailMessages,
} from "@/db/schema";
import { ApiError, refusal } from "@/features/agent-api/http";
import { applyOutcome } from "@/features/applications/outcome-service";
import { outcomeIds } from "@/features/applications/phase";
import { roundKinds } from "@/lib/round-kinds";
import { loadMailContext, type MailContext } from "./context";
import { lockMail, type MailTx } from "./handling-service";
import type { MailItem } from "./mail-item";
import { readMailItem } from "./mail-list";
import { mailIsOpen } from "./state";
import {
  classificationForTag,
  tagFromParam,
  tagOf,
  type MailClassification,
  type MailTag,
} from "./tags";

if (typeof window !== "undefined") throw new Error("Mail writes run on the server.");

const instant = z.iso.datetime({ offset: true });
export const handleSchema = z.union([
  z.strictObject({ justInfo: z.literal(true) }),
  z.strictObject({
    outcome: z.enum(outcomeIds),
    applicationId: z.uuid().optional(),
    details: z
      .strictObject({
        note: z.string().max(2000).optional(),
        name: z.string().max(200).optional(),
        kind: z.enum(roundKinds).optional(),
        at: instant.optional(),
        happenedAt: instant
          .refine(
            (value) => Date.parse(value) <= Date.now(),
            "When it happened cannot be in the future.",
          )
          .optional(),
      })
      .optional(),
  }),
]);
export const updateSchema = z
  .strictObject({
    /** A legacy tag id is read as its first new tag. */
    tag: z
      .string()
      .transform((value, ctx) => {
        const tag = tagFromParam(value);
        if (!tag) ctx.addIssue({ code: "custom", message: "Unknown tag." });
        return tag as MailTag;
      })
      .optional(),
    /** The exact kind to set, for Undo; a tag picks the tag's kind instead. */
    classification: z.enum(mailClassifications).optional(),
    company: z.string().trim().min(1).max(300).nullable().optional(),
    application: z.uuid().nullable().optional(),
    /** Undo for Just info; refused once an outcome or a lane link came from the email. */
    attention: z.literal("open").optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Send tag, classification, company, application or attention.",
  })
  .refine((value) => !(value.tag && value.classification), {
    message: "Send tag or classification, not both.",
  });

const closed = ["REJECTED", "WITHDRAWN", "CLOSED"];
const companyName = (context: MailContext, key: string) =>
  context.companies.find((company) => company.id === key)?.name ?? key;

async function lockVisibleMail(tx: MailTx, mailId: string, context: MailContext) {
  await readMailItem(mailId, context);
  return lockMail(tx, mailId);
}

/** Pick the application an outcome belongs to: explicit, linked, then the company's only open one. */
async function resolveApplication(
  message: typeof mailMessages.$inferSelect,
  requested: string | undefined,
  context: MailContext,
) {
  const known = (id: string) => context.applications.find((app) => app.id === id);
  let app = requested ? known(requested) : undefined;
  if (requested && !app) throw new ApiError("Application not found.", 404);
  app ??= message.linkedApplicationId ? known(message.linkedApplicationId) : undefined;
  if (!app) {
    if (!message.companyKey)
      throw new ApiError("Place this email at a company or pass applicationId.", 409);
    const statuses = new Map(
      (
        await db.select({ id: applications.id, status: applications.status }).from(applications)
      ).map((row) => [row.id, row.status]),
    );
    const open = context.applications.filter(
      (row) => row.company === message.companyKey && !closed.includes(statuses.get(row.id) ?? ""),
    );
    if (!open.length)
      throw new ApiError(
        "No open application at this company. Record the application first or pass applicationId.",
        409,
      );
    if (open.length > 1)
      throw new ApiError(
        "This company has more than one open application. Pass applicationId.",
        409,
        {
          candidates: open.map((row) => ({ id: row.id, role: row.role })),
        },
      );
    app = open[0];
  }
  if (message.companyKey && message.companyKey !== app.company)
    throw new ApiError(
      `This email is placed at ${companyName(context, message.companyKey)}. Move it before recording this outcome.`,
      409,
    );
  return app;
}

export async function handleMail(
  mailId: string,
  input: unknown,
  now = new Date(),
): Promise<MailItem> {
  const body = handleSchema.parse(input);
  const context = await loadMailContext();
  if ("justInfo" in body) {
    await db.transaction(async (tx) => {
      const { message, events } = await lockVisibleMail(tx, mailId, context);
      if (!mailIsOpen(message)) return;
      await tx
        .update(mailMessages)
        .set({ attentionState: "DONE", processedAt: now })
        .where(eq(mailMessages.id, mailId));
      for (const event of events)
        await tx
          .update(mailEvents)
          .set({ status: "REVIEWED", details: { ...event.details, justInfo: true } })
          .where(eq(mailEvents.id, event.id));
      await tx.insert(activityLogs).values({
        action: "MAIL_JUST_INFO",
        entityType: "MAIL",
        entityId: mailId,
        summary: "Marked an email as just information",
      });
    });
    return readMailItem(mailId, context);
  }
  await readMailItem(mailId, context);
  const [message] = await db.select().from(mailMessages).where(eq(mailMessages.id, mailId));
  if (!mailIsOpen(message)) throw new ApiError("This email has already been handled.", 409);
  const app = await resolveApplication(message, body.applicationId, context);
  const details = body.details ?? {};
  try {
    // applyOutcome locks application → job → mail and rechecks that the email is still open.
    await db.transaction(async (tx) => {
      await applyOutcome(
        tx,
        {
          applicationId: app.id,
          outcome: body.outcome,
          mailMessageId: mailId,
          detail: {
            kind: details.kind,
            at: details.at ? new Date(details.at) : undefined,
            name: details.name ?? "",
            note: details.note ?? "",
            happenedAt: details.happenedAt
              ? new Date(details.happenedAt)
              : new Date(Math.min(message.receivedAt.getTime(), now.getTime())),
          },
        },
        now,
      );
      await tx
        .update(mailMessages)
        .set({ companyKey: app.company })
        .where(eq(mailMessages.id, mailId));
    });
  } catch (error) {
    throw refusal(error);
  }
  return readMailItem(mailId, context);
}

/** Reopen an email handled as just info, keeping the record of having done so. */
async function reopenMail(
  tx: MailTx,
  message: typeof mailMessages.$inferSelect,
  events: (typeof mailEvents.$inferSelect)[],
) {
  if (mailIsOpen(message)) return;
  const [latest] = await tx
    .select({ eventType: applicationEvents.eventType, payload: applicationEvents.payload })
    .from(applicationEvents)
    .where(sql`${applicationEvents.payload}->>'mailMessageId' = ${message.id}`)
    .orderBy(desc(applicationEvents.createdAt))
    .limit(1);
  // An unlink already reopened the email once, so what came before it no longer holds.
  if (latest && latest.eventType !== "MAIL_UNLINKED")
    throw new ApiError(
      typeof latest.payload.outcome === "string"
        ? "An outcome was recorded from this email. Correct it on the application."
        : "This email was added to an application. Unlink it there to reopen it.",
      409,
    );
  await tx
    .update(mailMessages)
    .set({ attentionState: "OPEN", processedAt: null })
    .where(eq(mailMessages.id, message.id));
  for (const event of events) {
    const details = { ...event.details };
    delete details.justInfo;
    await tx
      .update(mailEvents)
      .set({ status: "NEEDS_REVIEW", details })
      .where(eq(mailEvents.id, event.id));
  }
  await tx.insert(activityLogs).values({
    action: "MAIL_REOPENED",
    entityType: "MAIL",
    entityId: message.id,
    summary: "Reopened an email marked as just information",
  });
}

/** Retag or place an email; `attention: "open"` undoes Just info. */
export async function updateMail(
  mailId: string,
  input: unknown,
  now = new Date(),
): Promise<MailItem> {
  return (await updateMailKind(mailId, input, now)).item;
}

/** `updateMail`, also returning the kind the email had before, which Undo puts back. */
export async function updateMailKind(
  mailId: string,
  input: unknown,
  now = new Date(),
): Promise<{ item: MailItem; previous: MailClassification }> {
  const body = updateSchema.parse(input);
  const context = await loadMailContext();
  let previous: MailClassification = "UNKNOWN";
  await db.transaction(async (tx) => {
    const { message, events } = await lockVisibleMail(tx, mailId, context);
    previous = message.classification;
    const classification =
      body.classification ??
      (body.tag ? classificationForTag(body.tag, message.classification) : undefined);
    if (classification) {
      if (classification !== message.classification) {
        await tx.update(mailMessages).set({ classification }).where(eq(mailMessages.id, mailId));
        for (const event of events)
          await tx
            .update(mailEvents)
            .set({ type: classification })
            .where(eq(mailEvents.id, event.id));
        await tx.insert(activityLogs).values({
          action: "MAIL_RETAGGED",
          entityType: "MAIL",
          entityId: mailId,
          summary: `Retagged an email as ${tagOf(classification)}`,
          metadata: { from: message.classification, to: classification },
        });
      }
    }
    let linked = message.linkedApplicationId;
    let companyKey = message.companyKey;
    if (body.application !== undefined) {
      const app = body.application
        ? context.applications.find((row) => row.id === body.application)
        : null;
      if (body.application && !app) throw new ApiError("Application not found.", 404);
      linked = app?.id ?? null;
      if (app) companyKey = app.company;
    }
    if (body.company !== undefined) {
      if (body.company !== null && !context.companies.some((row) => row.id === body.company))
        throw new ApiError("Choose an existing company.", 404);
      const app = linked ? context.applications.find((row) => row.id === linked) : undefined;
      if (app && app.company !== body.company)
        throw new ApiError(
          "This email is linked to an application at another company. Unlink it before moving it.",
          409,
        );
      companyKey = body.company;
    }
    if (body.attention === "open") await reopenMail(tx, message, events);
    if (linked === message.linkedApplicationId && companyKey === message.companyKey) return;
    await tx
      .update(mailMessages)
      .set({ linkedApplicationId: linked, companyKey })
      .where(eq(mailMessages.id, mailId));
    await tx.insert(activityLogs).values({
      action: "MAIL_PLACED",
      entityType: "MAIL",
      entityId: mailId,
      summary: "Placed an email at a company or application",
      metadata: { company: companyKey, application: linked, at: now.toISOString() },
    });
  });
  return { item: await readMailItem(mailId, context), previous };
}
