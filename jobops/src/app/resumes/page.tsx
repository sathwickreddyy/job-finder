import Link from "next/link";
import { Panel } from "@/components/ui";
import { ResumeLibrary } from "@/features/resumes/library";
import { resumeFiles } from "@/features/resumes/presentation";
import { ResumeUploadDrawer } from "@/features/resumes/upload-drawer";

export default async function Resumes({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const p = await searchParams;
  const families = await resumeFiles(p.archived === "1");
  return (
    <div className="space-y-6">
      <ResumeLibrary
        families={families}
        layout="rows"
        detailLinks
        uploadControl={<ResumeUploadDrawer key="upload" families={families} />}
      />
      {!families.length && (
        <Panel>
          <h2 className="text-xl font-semibold">No uploaded resumes yet</h2>
          <p className="mt-2 text-muted-foreground">
            Use Upload a resume to add your original PDF.
          </p>
        </Panel>
      )}
      {families
        .filter((family) => !family.files.length)
        .map((family) => (
          <Panel key={family.id}>
            <Link href={`/resumes/${family.id}`}>{family.name} · upload its first PDF</Link>
          </Panel>
        ))}
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <Link href="/resume-prompt">Tailor a resume for a role</Link>
        <Link href={p.archived === "1" ? "/resumes" : "/resumes?archived=1"}>
          {p.archived === "1" ? "Hide archived resumes" : "Include archived resumes"}
        </Link>
      </div>
    </div>
  );
}
