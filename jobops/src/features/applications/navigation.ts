import { z } from "zod";

/** A company's page: its own link when it has a company record, else the page for its key. */
export function companyPageHref(record: { companyKey: string; companyHref?: string | null }) {
  return record.companyHref ?? `/companies/${encodeURIComponent(record.companyKey)}`;
}

type LinkExtra = {
  mail?: string | null;
  outcome?: string | null;
  round?: string | null;
  /** A one-line result shown on the company page, such as after unlinking an email. */
  notice?: string | null;
};

/**
 * The one link to an application. `/applications/<id>` redirects to its row on the company
 * page, carrying `mail`, `outcome` and `round` along.
 */
export function laneHref(recordId: string, extra: LinkExtra = {}) {
  const query = new URLSearchParams();
  if (extra.mail) query.set("mail", extra.mail);
  if (extra.outcome) query.set("outcome", extra.outcome);
  if (extra.round) query.set("round", extra.round);
  const text = query.toString();
  return `/applications/${recordId}${text ? `?${text}` : ""}`;
}

/** The application's row, open, on its company page; a round link scrolls to that round card. */
export function applicationHref(
  record: { id: string; companyKey: string; companyHref?: string | null },
  extra: LinkExtra = {},
) {
  const query = new URLSearchParams({ open: record.id });
  if (extra.mail) query.set("mail", extra.mail);
  if (extra.outcome) query.set("outcome", extra.outcome);
  if (extra.notice) query.set("notice", extra.notice);
  const anchor = extra.round ? `round-${extra.round}` : `application-${record.id}`;
  return `${companyPageHref(record)}?${query}#${anchor}`;
}

export type LanesView = {
  open: string | null;
  mail: string | null;
  outcome: string | undefined;
  emails: boolean;
  notice: string | undefined;
};

/** Old `?open=<recordId>` links redirect to the application; `?emails=1` and `?tab=emails` to /mail. */
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
