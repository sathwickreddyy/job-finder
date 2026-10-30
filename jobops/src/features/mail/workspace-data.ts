import type { SearchDecision } from "./search-policy";
import type { WorkspaceApplication, WorkspaceCompany } from "./context";
export type MailRow = {
  id: string;
  company: string;
  application: string | null;
  account: string;
  accountEmail: string;
  provider: string;
  name: string;
  sender: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
  firstTrackedAt: string;
  time: string;
  group: string;
  kind: string;
  action: string;
  sourceFolder: string;
  folders: string[];
  decision: SearchDecision;
  companyKeys: string[];
  applicationIds: string[];
  messageId: string | null;
};
export type WorkspaceQuery = {
  company?: string;
  application?: string;
  view?: string;
  account?: string;
  q?: string;
  before?: string;
  selected?: string;
  notice?: string;
};
export type MailWorkspaceData = {
  companies: WorkspaceCompany[];
  applications: WorkspaceApplication[];
  messages: MailRow[];
  counts: { latest: number; history: number; excluded: number };
  total: number;
  nextBefore: string | null;
  baselineAt: string;
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
  scans: {
    account: string;
    mode: string;
    scanned: number;
    matched: number;
    complete: boolean;
    checkedAt: string;
  }[];
};
