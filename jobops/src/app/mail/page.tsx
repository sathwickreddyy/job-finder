import { MailView } from "@/features/timeline/mail-view";
import { readMailView } from "@/features/timeline/mail-data";
import { readAttentionMail } from "@/features/mobile/read";
import { MobileMailWorkspace } from "@/features/mobile/mail-workspace";

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
  const data = await readMailView(raw);
  const attention = await readAttentionMail(data.query);
  return (
    <>
      <MobileMailWorkspace data={data} attention={attention} />
      <div className="hidden md:block">
        <MailView data={data} />
      </div>
    </>
  );
}
