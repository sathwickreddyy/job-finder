type RoleRef = { id: string; role: string; requisition: string | null };

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const squash = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The applications an email is about: a requisition standing alone in its text wins,
 * otherwise the exact role title (not a longer title or a higher level of it).
 */
export function matchingRoles(
  item: { subject: string; text: string },
  applications: RoleRef[],
): Set<string> {
  const body = `${item.subject}\n${item.text}`;
  const lowered = squash(body);
  const matches = new Set<string>();
  for (const app of applications) {
    const requisition = app.requisition?.trim();
    if (requisition && new RegExp(`(?<![\\w/])${escape(requisition)}(?!\\w)`).test(body)) {
      matches.add(app.id);
      continue;
    }
    const title = squash(app.role);
    if (
      title &&
      new RegExp(`(?<![a-z0-9])${escape(title)}(?![a-z0-9])(?!\\s+(?:i{1,3}|iv|v|\\d+)\\b)`).test(
        lowered,
      )
    )
      matches.add(app.id);
  }
  return matches;
}
