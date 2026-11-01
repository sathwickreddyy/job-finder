import { MobileGallery } from "@/features/mobile-gallery/gallery";

export const metadata = { title: "iPhone view options" };

export default async function MobileGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string }>;
}) {
  const { screen } = await searchParams;
  return (
    <MobileGallery
      initialScreen={screen === "applications" || screen === "mail" ? screen : "overview"}
    />
  );
}
