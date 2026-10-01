import { readWorkspace } from "@/features/workspace/read";
import { WorkspaceHome } from "@/features/workspace/home";
export const dynamic = "force-dynamic";
export default async function Home() {
  return <WorkspaceHome data={await readWorkspace()} />;
}
