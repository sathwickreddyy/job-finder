/** A company key from the URL; keys are lower-case names, so they can hold encoded spaces. */
export function companyParam(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
