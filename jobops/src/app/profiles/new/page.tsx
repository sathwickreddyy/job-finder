import { PageHeader, Panel } from "@/components/ui";
import { ProfileForm } from "@/features/profiles/profile-form";
export default function NewProfilePage() { return <><PageHeader title="Add portal profile" description="Record a profile URL and the state you have observed. No portal credentials are stored." /><Panel><ProfileForm /></Panel></>; }
