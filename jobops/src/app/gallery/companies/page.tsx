import { CompanyGallery } from "@/features/companies/gallery";
import { readWorkspace } from "@/features/workspace/read";

export default async function CompaniesGalleryPage() {
  return <CompanyGallery data={await readWorkspace()} />;
}
