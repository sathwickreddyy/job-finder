import type { WorkspaceApplication, WorkspaceCompany } from "./context";
import type { MailItem } from "./mail-item";

export type WorkspaceQuery = {
  view?: string;
  company?: string;
  application?: string;
  q?: string;
  cursor?: string;
  selected?: string;
  notice?: string;
};
export type MailWorkspaceData = {
  companies: WorkspaceCompany[];
  applications: WorkspaceApplication[];
  items: MailItem[];
  openCount: number;
  nextCursor: string | null;
  connections: {
    id: string;
    provider: string;
    email: string;
    lastChecked: string | null;
    lastError: string | null;
  }[];
  configs: { slug: string; label: string; configured: boolean; missing: string[] }[];
  coverage: {
    account: string;
    checkedAt: string | null;
    folders: { id: string; name: string; contextOnly?: boolean }[];
  }[];
};
