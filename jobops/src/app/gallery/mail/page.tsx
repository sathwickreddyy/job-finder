import { MailWorkspaceGallery } from "@/features/mail/gallery/workspace";

export const metadata = { title: "Company mail workspace options" };

export default function MailGalleryPage() {
  return (
    <>
      <a className="mb-4 inline-block text-sm text-link" href="/gallery/mail/search">
        Try the inbox search preview →
      </a>
      <MailWorkspaceGallery />
    </>
  );
}
