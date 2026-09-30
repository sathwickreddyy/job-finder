import { PageHeader, Panel } from "@/components/ui";
import { ContactForm } from "@/features/contacts/contact-form";
export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) { const { company } = await searchParams; return <><PageHeader title="Add contact" description="Record a publicly available contact and how you found or verified them." /><Panel><ContactForm company={company} /></Panel></>; }
