import { redirect } from "next/navigation";

export default function InboxPage() {
  redirect("/applications?emails=1");
}
