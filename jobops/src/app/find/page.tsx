import { readWorkspace } from "@/features/workspace/read";
import { Discovery } from "@/features/workspace/discovery";
export const dynamic = "force-dynamic";
export default async function Find() {
  const data = await readWorkspace();
  return <Discovery role={data.role} location={data.location} context={data.context} />;
}
