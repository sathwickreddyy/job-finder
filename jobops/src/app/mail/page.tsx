import { MailView } from "@/features/timeline/mail-view";
import { readMailView } from "@/features/timeline/mail-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mail" };

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = Object.fromEntries(
    Object.entries(await searchParams).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value.slice(0, 2000)]] : [],
    ),
  );
  return <MailView data={await readMailView(raw)} />;
}
