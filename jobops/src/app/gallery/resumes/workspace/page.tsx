import { resumeFiles } from "@/features/resumes/presentation";
import { ResumeWorkspaceGallery } from "@/features/resumes/workspace/gallery";
export const metadata = { title: "Resume workspace options" };
export default async function ResumeWorkspaceGalleryPage() {
  return <ResumeWorkspaceGallery families={await resumeFiles()} />;
}
