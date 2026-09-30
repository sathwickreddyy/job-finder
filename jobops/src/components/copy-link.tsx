"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyLink({ path, label }: { path: string; label: string }) {
  const [status, setStatus] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(new URL(path, window.location.origin).href);
            setStatus("Link copied");
          } catch {
            setStatus("Copy unavailable. Open the link and copy its address.");
          }
        }}
      >
        {label}
      </Button>
      <span role="status" className="text-xs text-muted-foreground">
        {status}
      </span>
    </span>
  );
}
