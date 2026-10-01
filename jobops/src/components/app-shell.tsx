"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  BriefcaseBusiness,
  Building2,
  FileText,
  Home,
  Inbox,
  Moon,
  Search,
  Sun,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { label: "Home", href: "/", icon: Home, routes: [] },
  {
    label: "Find openings",
    href: "/find",
    icon: Search,
    routes: ["/jobs", "/opportunities", "/outreach"],
  },
  { label: "Resumes", href: "/resumes", icon: FileText, routes: ["/resume-prompt"] },
  { label: "Companies", href: "/companies", icon: Building2, routes: [] },
  { label: "Applications", href: "/applications", icon: BriefcaseBusiness, routes: [] },
];
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("jobops-theme", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("jobops-theme", callback);
  };
}
function snapshot() {
  try {
    return localStorage.getItem("jobops-theme") === "light";
  } catch {
    return document.documentElement.dataset.theme === "light";
  }
}
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const light = useSyncExternalStore(subscribe, snapshot, () => false);
  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
  }, [light]);
  function toggleTheme() {
    const next = light ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("jobops-theme", next);
    } catch {
      /* Session-only theme. */
    }
    window.dispatchEvent(new Event("jobops-theme"));
  }
  if (pathname.startsWith("/gallery/simple") || pathname.startsWith("/gallery/companies"))
    return <main id="main">{children}</main>;
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-3 text-lg font-semibold text-foreground hover:no-underline"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              J
            </span>
            JobOps
          </Link>
          <nav
            aria-label="Primary"
            className="order-3 flex w-full gap-1 overflow-x-auto pb-1 md:order-none md:w-auto md:pb-0"
          >
            {navigation.map(({ label, href, icon: Icon, routes }) => {
              const active =
                pathname === href || routes.some((route) => pathname.startsWith(route));
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "pressable flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium hover:no-underline",
                    active
                      ? "bg-selected text-selected-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon size={16} aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-1">
            <Link
              href="/inbox"
              aria-label="Inbox"
              className={cn(
                "pressable grid size-10 place-items-center rounded-full hover:bg-muted",
                pathname.startsWith("/inbox") || pathname.startsWith("/mail")
                  ? "bg-selected text-selected-foreground"
                  : "text-muted-foreground",
              )}
            >
              <Inbox size={18} aria-hidden />
            </Link>
            <Link
              href="/my-profile"
              aria-label="My sites & profile"
              className={cn(
                "pressable grid size-10 place-items-center rounded-full hover:bg-muted",
                pathname.startsWith("/my-profile")
                  ? "bg-selected text-selected-foreground"
                  : "text-muted-foreground",
              )}
            >
              <UserRound size={18} aria-hidden />
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className="pressable grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label={light ? "Use dark theme" : "Use light theme"}
            >
              {light ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full min-w-0 max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}
