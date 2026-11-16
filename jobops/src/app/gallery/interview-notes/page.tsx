import { readFile } from "node:fs/promises";
import path from "node:path";
import { InterviewNotesGallery } from "@/features/interview-notes-gallery/gallery";
import { sampleData, sampleLibrary } from "@/features/interview-notes-gallery/sample";
import type { InterviewGalleryData } from "@/features/interview-notes-gallery/types";

export const metadata = { title: "Interview notes options" };
export const dynamic = "force-dynamic";

// Real interview notes stay in private storage; the committed sample keeps the gallery usable without them.
async function load(): Promise<InterviewGalleryData> {
  const root = process.env.STORAGE_ROOT ?? "./data/uploads";
  try {
    const raw = await readFile(path.join(root, "gallery-fixtures", "interview-notes.json"), "utf8");
    const parsed = JSON.parse(raw) as Omit<InterviewGalleryData, "real">;
    if (Array.isArray(parsed.applications) && parsed.applications.length)
      return { ...parsed, library: [...parsed.library, ...sampleLibrary], real: true };
  } catch {}
  return { ...sampleData, library: sampleLibrary };
}

export default async function InterviewNotesGalleryPage() {
  return <InterviewNotesGallery data={await load()} />;
}
