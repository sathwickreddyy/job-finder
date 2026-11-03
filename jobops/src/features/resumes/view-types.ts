export type ResumeUse = {
  id: string;
  company: string;
  role: string;
  method: string;
  outcome: string;
  date: string | null;
  submitted: boolean;
};

export type GalleryFile = {
  id: string;
  familyId: string;
  familyName: string;
  label: string;
  filename: string;
  uploaded: string;
  size: string;
  isDefault: boolean;
  isMaster?: boolean;
  isArchived?: boolean;
  textExtracted: boolean;
  changeNotes: string;
  assessmentCount: number;
  uses: ResumeUse[];
};

export type GalleryFamily = {
  id: string;
  name: string;
  isArchived?: boolean;
  files: GalleryFile[];
};

export function submittedCount(file: GalleryFile) {
  return file.uses.filter((record) => record.submitted).length;
}

/** Unique companies a file was used for, in first-use order. */
export function usedCompanies(file: GalleryFile) {
  return [...new Set(file.uses.map((record) => record.company))];
}

/** "A, B +3": a short list that never grows with the number of names. */
export function shortList(names: string[], max = 2) {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

const dateLike = /^(\d{1,2} [A-Z][a-z]{2,8} \d{4}|\d{4}-\d{2}-\d{2})$/;

/**
 * Splits "Walmart Senior SWE (GDF) · R-2655406 · 2 Nov 2026 · v2" into a short
 * title and the details that tell versions apart ("R-2655406 · v2"). The date is
 * dropped because the rail already groups files by upload day.
 */
export function splitLabel(label: string) {
  const [title, ...rest] = label.split(" · ").map((part) => part.trim());
  return { title, detail: rest.filter((part) => part && !dateLike.test(part)).join(" · ") };
}

/** Sent applications first, then outreach and drafts, keeping each group's order. */
export function orderedUses(file: GalleryFile) {
  return [
    ...file.uses.filter((record) => record.submitted),
    ...file.uses.filter((record) => !record.submitted),
  ];
}

export function initialFile(files: GalleryFile[]) {
  return files.find((file) => submittedCount(file) > 0) ?? files[0];
}
