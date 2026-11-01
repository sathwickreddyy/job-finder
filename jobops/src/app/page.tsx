import { readWorkspace } from "@/features/workspace/read";
import { WorkspaceHome } from "@/features/workspace/home";
import { readApplications } from "@/features/applications/read";
import { mobileAnalytics } from "@/features/mobile/analytics";
import { readAttentionMail } from "@/features/mobile/read";
import { MobileOverview } from "@/features/mobile/overview";
export const dynamic = "force-dynamic";
export default async function Home() {
  const [data, { records }] = await Promise.all([readWorkspace(), readApplications()]);
  const attention = await readAttentionMail({}, records);
  return (
    <>
      <MobileOverview
        analytics={mobileAnalytics(records, new Date(data.today))}
        attention={attention}
      />
      <div className="hidden md:block">
        <WorkspaceHome data={data} />
      </div>
    </>
  );
}
