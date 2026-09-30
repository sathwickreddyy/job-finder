import Link from "next/link";
export default function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Record not found</h1>
      <p>This record is unavailable. Return to your workbench to find another.</p>
      <Link href="/" className="text-primary underline">
        Return to Today
      </Link>
    </div>
  );
}
