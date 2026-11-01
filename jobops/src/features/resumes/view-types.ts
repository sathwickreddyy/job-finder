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
