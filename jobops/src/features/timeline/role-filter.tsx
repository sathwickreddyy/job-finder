"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Up to this many roles show as chips on one line; more fold into one Role menu. */
const roleChipLimit = 3;

/** Filter by role: chips for a few roles, otherwise a "Role: …" menu of the same links. */
export function RoleFilter({
  roles,
  allRolesHref,
  role,
}: {
  roles: { id: string; role: string; href: string }[];
  allRolesHref: string;
  role: string | null;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const links = [{ id: null, role: "All roles", href: allRolesHref }, ...roles];
  if (roles.length > roleChipLimit) {
    const current = roles.find((item) => item.id === role)?.role ?? "All roles";
    return (
      <nav role="group" aria-label="Filter by role" className="mb-5">
        <details ref={menu} className="relative inline-block max-w-full">
          <summary className="pressable inline-flex h-8 max-w-full cursor-pointer list-none items-center gap-1.5 rounded-full px-3 text-sm ring-1 ring-border hover:bg-muted [&::-webkit-details-marker]:hidden">
            <span className="text-muted-foreground">Role:</span>
            <span className="truncate font-medium">{current}</span>
            <ChevronDown aria-hidden size={15} className="shrink-0" />
          </summary>
          <div className="absolute left-0 top-full z-20 mt-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-surface">
            {links.map((link) => (
              <Link
                key={link.id ?? "all"}
                href={link.href}
                scroll={false}
                aria-current={role === link.id ? "page" : undefined}
                onClick={() => menu.current?.removeAttribute("open")}
                className={cn(
                  "flex min-h-10 items-center px-3 text-sm text-foreground hover:bg-muted hover:no-underline",
                  role === link.id && "bg-selected text-selected-foreground",
                )}
              >
                <span className="truncate">{link.role}</span>
              </Link>
            ))}
          </div>
        </details>
      </nav>
    );
  }
  return (
    <nav role="group" aria-label="Filter by role" className="mb-5 flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={link.id ?? "all"}
          href={link.href}
          scroll={false}
          aria-current={role === link.id ? "page" : undefined}
          className={cn(
            "pressable inline-flex h-8 max-w-full items-center truncate rounded-full px-3 text-sm hover:no-underline",
            role === link.id
              ? "bg-foreground text-background"
              : "text-muted-foreground ring-1 ring-border hover:text-foreground",
          )}
        >
          {link.role}
        </Link>
      ))}
    </nav>
  );
}
