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

export type GalleryFamily = { id: string; name: string; files: GalleryFile[] };

export function submittedCount(file: GalleryFile) {
  return file.uses.filter((record) => record.submitted).length;
}

export function initialFile(files: GalleryFile[]) {
  return files.find((file) => submittedCount(file) > 0) ?? files[0];
}
