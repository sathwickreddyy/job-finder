import { notFound } from "next/navigation";
import { SimpleWorkspace } from "@/features/simple-preview/workspace";
import { readSimplePreview } from "@/features/simple-preview/read";

export const dynamic = "force-dynamic";

export default async function SimpleGallery({
  params,
  searchParams,
}: {
  params: Promise<{ screen?: string[] }>;
  searchParams: Promise<{ layout?: string }>;
}) {
  const [{ screen = [] }, query] = await Promise.all([params, searchParams]);
  const page = screen[0] ?? "home";
  if (
    screen.length > 1 ||
    !["home", "find", "job", "resumes", "resume-prompt", "applications", "sites"].includes(page)
  )
    notFound();
  return (
    <SimpleWorkspace
      screen={page}
      compact={query.layout === "compact"}
      data={await readSimplePreview()}
    />
  );
}
