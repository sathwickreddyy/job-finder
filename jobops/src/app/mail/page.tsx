import { MailView } from "@/features/timeline/mail-view";
import { readMailView } from "@/features/timeline/mail-data";
import { readMobileMail } from "@/features/mobile/read";
import { MobileMailWorkspace } from "@/features/mobile/mail-workspace";
import { mailCursor } from "@/features/timeline/query";

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
  const mobileQuery = {
    ...data.query,
    // Desktop may infer All job mail and a cursor for a deep link. On mobile, only
    // the explicit URL selects the full feed or moves away from its first page.
    all: data.pinned && data.query.all,
    cursor: mailCursor.safeParse(raw.cursor).data ?? null,
  };
  const mobileMail = await readMobileMail(mobileQuery);
  return (
    <>
      <MobileMailWorkspace data={data} feed={mobileMail} query={mobileQuery} />
      <div className="hidden md:block">
        <MailView data={data} />
      </div>
    </>
  );
}
