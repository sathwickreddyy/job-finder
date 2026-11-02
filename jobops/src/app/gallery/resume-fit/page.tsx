import { readFile } from "node:fs/promises";
import path from "node:path";
import { ResumeFitGallery } from "@/features/resume-fit-gallery/gallery";
import { sampleOpenings } from "@/features/resume-fit-gallery/sample";
import type { FitOpening } from "@/features/resume-fit-gallery/types";

export const metadata = { title: "Résumé fit options" };
export const dynamic = "force-dynamic";

// Real check results stay in private storage; the committed sample keeps the gallery usable without them.
async function openings(): Promise<{ items: FitOpening[]; real: boolean }> {
  const root = process.env.STORAGE_ROOT ?? "./data/uploads";
  try {
    const raw = await readFile(path.join(root, "gallery-fixtures", "resume-fit.json"), "utf8");
    const items = JSON.parse(raw) as FitOpening[];
    if (Array.isArray(items) && items.length) return { items, real: true };
  } catch {}
  return { items: sampleOpenings, real: false };
}

export default async function ResumeFitGalleryPage() {
  const { items, real } = await openings();
  return <ResumeFitGallery openings={items} real={real} />;
}
