import { redirect } from "next/navigation";

export default function MailReviewPage() {
  redirect("/applications?tab=emails");
}
