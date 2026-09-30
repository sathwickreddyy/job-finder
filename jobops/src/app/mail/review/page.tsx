import { redirect } from "next/navigation";
export default function MailReviewPage() { redirect("/mail?status=NEEDS_REVIEW"); }
