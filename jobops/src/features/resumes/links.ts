/** The resume workspace selects an exact PDF version, or a family's current one. */
export function resumeFileHref(versionId: string) {
  return `/resumes?file=${versionId}`;
}

export function resumeFamilyHref(familyId: string) {
  return `/resumes?resume=${familyId}`;
}
