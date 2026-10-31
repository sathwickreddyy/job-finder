import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

const unusualFolder = /junk|spam|trash|deleted/i;

/** Which inbox and folder an email came from; quiet unless it sat in Junk, Spam or Trash. */
export function SourceChip({
  account,
  folders,
  className,
}: {
  account: string;
  folders: string[];
  className?: string;
}) {
  const unusual = folders.find((folder) => unusualFolder.test(folder));
  return (
    <span
      title={`Found in ${account}, ${folders.join(", ") || "Mailbox"}`}
      className={cn(
        "inline-flex h-6 max-w-48 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs",
        unusual ? "bg-warning-soft text-warning" : "text-muted-foreground",
        className,
      )}
    >
      <Inbox aria-hidden size={12} className="shrink-0" />
      <span className="truncate">{account.split("@")[0]}</span>
      {unusual && <span className="shrink-0">{unusual}</span>}
    </span>
  );
}
