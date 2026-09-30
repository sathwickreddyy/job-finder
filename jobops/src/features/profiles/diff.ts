export type ProfileDiff = {
  field: string;
  current: unknown;
  target: unknown;
  added?: string[];
  removed?: string[];
};
function normalized(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(normalized).sort());
  if (value && typeof value === "object")
    return JSON.stringify(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalized(v)]),
    );
  return JSON.stringify(value) ?? "UNKNOWN";
}
export function computeProfileDiff(
  known: Record<string, unknown>,
  target: Record<string, unknown>,
): ProfileDiff[] {
  return Object.entries(target)
    .filter(([, value]) => value !== "UNKNOWN" && value !== null && value !== undefined)
    .flatMap(([field, value]) => {
      const current = known[field] ?? "UNKNOWN";
      if (normalized(current) === normalized(value)) return [];
      const diff: ProfileDiff = { field, current, target: value };
      if (
        Array.isArray(current) &&
        current.every((v) => typeof v === "string") &&
        Array.isArray(value) &&
        value.every((v) => typeof v === "string")
      ) {
        diff.added = value.filter((v) => !current.includes(v));
        diff.removed = current.filter((v) => !value.includes(v));
      }
      return [diff];
    });
}
