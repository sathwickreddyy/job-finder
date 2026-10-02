import { ResumeGallery } from "@/features/resumes/gallery";
import { resumeFiles } from "@/features/resumes/presentation";
export const metadata = { title: "Resume design options" };
export default async function ResumeGalleryPage() {
  return <ResumeGallery families={await resumeFiles()} />;
}
