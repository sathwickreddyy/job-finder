import type { ReactNode } from "react";
import { BriefcaseBusiness, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { UsageRecord } from "../file-ui";
import { submittedCount, type GalleryFile } from "../view-types";

export function FileHeader({ file, actions }: { file: GalleryFile; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 flex-1 basis-80">
        <p className="m-0 text-xs text-muted-foreground">
          {file.familyName}
          {file.isArchived ? " (archived)" : ""}
        </p>
        <h2 className="m-0 mt-1.5 text-xl font-semibold leading-snug tracking-tight">
          {file.label}
        </h2>
        <p className="m-0 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="break-all">{file.filename}</span>
          <span>{file.size}</span>
          <span>Uploaded {file.uploaded}</span>
        </p>
        {(file.isDefault || !file.textExtracted) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {file.isDefault && (
              <span className="rounded-full bg-selected px-2.5 py-0.5 text-[11px] font-medium text-selected-foreground">
                Default for new applications
              </span>
            )}
            {!file.textExtracted && (
              <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-[11px] font-medium text-warning">
                Text extraction needs review
              </span>
            )}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function UsedFor({ file, className }: { file: GalleryFile; className?: string }) {
  const sent = submittedCount(file);
  return (
    <section aria-label={`Applications using ${file.label}`} className={cn("min-w-0", className)}>
      <h3 className="m-0 flex items-baseline justify-between gap-3 text-sm font-semibold">
        Used for
        <span className="text-xs font-normal text-muted-foreground">
          {sent} sent{file.uses.length > sent ? `, ${file.uses.length - sent} preparing` : ""}
        </span>
      </h3>
      {file.uses.length ? (
        <div className="-mx-3 mt-2 space-y-1">
          {file.uses.map((record) => (
            <UsageRecord key={record.id} record={record} />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-border p-4">
          <BriefcaseBusiness
            size={20}
            strokeWidth={1.5}
            className="mb-2 text-muted-foreground"
            aria-hidden
          />
          <p className="m-0 text-sm font-medium">Not sent anywhere yet</p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-muted-foreground">
            Applications record the exact PDF they used, so this list fills in as you apply.
          </p>
        </div>
      )}
    </section>
  );
}

export function DetailSection({
  title,
  status,
  defaultOpen = false,
  children,
}: {
  title: string;
  status: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-border last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 !px-0 py-4 [&::-webkit-details-marker]:hidden">
        <span className="flex-1 text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{status}</span>
        <ChevronDown
          size={16}
          className="text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="pb-5">{children}</div>
    </details>
  );
}
