import { notFound, redirect } from "next/navigation";
import { mailLocation } from "@/features/timeline/read";

export const dynamic = "force-dynamic";

/** Old single-email links open that email in its company timeline. */
export default async function MailMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect((await mailLocation(id)) ?? notFound());
}
