import { z } from "zod";

/** The Applications page with the lane holding this record expanded (spec §1). */
export function laneHref(
  recordId: string,
  extra: { mail?: string | null; outcome?: string | null } = {},
) {
  const query = new URLSearchParams({ open: recordId });
  if (extra.mail) query.set("mail", extra.mail);
  if (extra.outcome) query.set("outcome", extra.outcome);
  return `/applications?${query}`;
}

export type LanesView = {
  open: string | null;
  mail: string | null;
  outcome: string | undefined;
  emails: boolean;
  notice: string | undefined;
};

/** `?open=<recordId>` expands a lane; `?emails=1` (or the old `?tab=emails`) opens the drawer. */
export function resolveLanesView(params: {
  open?: string;
  mail?: string;
  outcome?: string;
  emails?: string;
  tab?: string;
  notice?: string;
}): LanesView {
  const open = params.open && z.uuid().safeParse(params.open).success ? params.open : null;
  return {
    open,
    mail: open && params.mail !== undefined ? params.mail : null,
    outcome: open ? params.outcome : undefined,
    emails: params.emails === "1" || params.tab === "emails",
    notice: params.notice ? params.notice.slice(0, 300) : undefined,
  };
}
