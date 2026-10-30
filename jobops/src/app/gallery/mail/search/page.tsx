import { MailSearchWorkspace } from "@/features/mail/search-workspace";
import { previewAccounts } from "@/features/mail/search-preview";
export const metadata = { title: "Inbox search preview" };
export default function MailSearchGallery() {
  return (
    <MailSearchWorkspace
      preview
      accounts={previewAccounts}
      initialCompany="amazon"
      companies={[{ id: "amazon", name: "Amazon", aliases: ["Amazon Jobs"] }]}
      backHref="/gallery/mail"
    />
  );
}
