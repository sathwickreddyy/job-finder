import { redirect } from "next/navigation";

export default function MailPage() {
  redirect("/applications?emails=1");
}
