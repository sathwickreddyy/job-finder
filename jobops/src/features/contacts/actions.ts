"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activityLogs, contacts, contactVerificationStatuses } from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
const contactSchema = z
  .object({
    company: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(200),
    title: z.string().max(300),
    email: z
      .string()
      .trim()
      .refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email")
      .transform((v) => v || null),
    linkedinUrl: z
      .string()
      .trim()
      .refine(
        (v) => !v || (z.url().safeParse(v).success && /^https?:\/\//.test(v)),
        "Enter a valid http:// or https:// URL",
      )
      .transform((v) => v || null),
    source: z.string().trim().min(1).max(2000),
    verificationStatus: z.enum(contactVerificationStatuses),
    verificationSource: z
      .string()
      .max(2000)
      .transform((v) => v || null),
    notes: z.string().max(15000),
  })
  .refine((v) => v.verificationStatus !== "MANUAL_VERIFIED" || Boolean(v.verificationSource), {
    path: ["verificationSource"],
    message: "Record how this contact was manually verified",
  });
export async function saveContact(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = formString(form, "id");
    if (id) z.uuid().parse(id);
    const data = contactSchema.parse(
      Object.fromEntries(
        [
          "company",
          "name",
          "title",
          "email",
          "linkedinUrl",
          "source",
          "verificationStatus",
          "verificationSource",
          "notes",
        ].map((key) => [key, formString(form, key)]),
      ),
    );
    const savedId = await db.transaction(async (tx) => {
      const [saved] = id
        ? await tx
            .update(contacts)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(contacts.id, id))
            .returning()
        : await tx.insert(contacts).values(data).returning();
      if (!saved)
        throw new Error("This contact no longer exists. Return to Contacts and choose again.");
      await tx.insert(activityLogs).values({
        action: id ? "CONTACT_UPDATED" : "CONTACT_CREATED",
        entityType: "CONTACT",
        entityId: saved.id,
        summary: `${saved.name} at ${saved.company} ${id ? "updated" : "added"}`,
        metadata: { verificationStatus: data.verificationStatus },
      });
      return saved.id;
    });
    revalidatePath("/contacts");
    revalidatePath(`/contacts/${savedId}`);
    revalidatePath("/jobs");
    return {
      success: "Contact saved with its source and verification status.",
      redirect: `/contacts/${savedId}`,
    };
  } catch (error) {
    return actionError(error);
  }
}
