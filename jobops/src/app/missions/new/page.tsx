import { PageHeader } from "@/components/ui";
import { MissionCreateForm } from "@/features/missions/forms";
import { getMissionOptions } from "@/features/missions/service";
import { MISSION_TYPES } from "@/features/missions/domain";
import { z } from "zod";
export const dynamic = "force-dynamic";
export default async function NewMissionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsedType = z.enum(MISSION_TYPES).safeParse(params.type);
  const options = await getMissionOptions();
  const entityType = z
    .enum(["NONE", "JOB", "PROFILE", "APPLICATION", "CONTACT"])
    .safeParse(params.entityType);
  const entityId = z.uuid().safeParse(params.entityId);
  return (
    <>
      <PageHeader
        title="Create mission"
        description="Choose the task, review its exact instructions, and decide what the operator may change."
      />
      <MissionCreateForm
        options={options}
        initialType={parsedType.success ? parsedType.data : "DISCOVER_JOBS"}
        initialEntityType={entityType.success ? entityType.data : undefined}
        initialEntityId={entityId.success ? entityId.data : undefined}
      />
    </>
  );
}
