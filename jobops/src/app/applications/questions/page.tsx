import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { readLibrary } from "@/features/interviews/questions";
import type { LibraryRow } from "@/features/interviews/types";
import { LibraryTable } from "@/features/interviews/views/library-table";

export const dynamic = "force-dynamic";

/** Up to this many questions load at once; the table filters and sorts them in place. */
const LIMIT = 500;

export default async function QuestionLibraryPage() {
  const rows: LibraryRow[] = [];
  let cursor: string | undefined;
  do {
    const page = await readLibrary({ limit: 200, cursor });
    rows.push(...page.rows);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && rows.length < LIMIT);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Link
        href="/applications"
        className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-link"
      >
        <ArrowLeft aria-hidden size={14} />
        Back to Applications
      </Link>
      <PageHeader
        title="Question library"
        description="Every interview question you recorded, across companies, to revise before the next round."
      />
      <LibraryTable rows={rows.slice(0, LIMIT)} />
    </div>
  );
}
