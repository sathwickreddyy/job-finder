"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  BriefcaseBusiness,
  ChartNoAxesCombined,
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
import { LoadingProvider } from "@/components/loading/overlay";
import { SnackbarProvider } from "@/components/snackbar";

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
export function AppShell({
  children,
  attentionCount = 0,
}: {
  children: ReactNode;
  attentionCount?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const emailsActive =
    pathname.startsWith("/mail") ||
    (pathname === "/applications" &&
      (searchParams.get("emails") === "1" || searchParams.get("tab") === "emails"));
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
  return (
    <LoadingProvider>
      <SnackbarProvider>
        <div className="min-h-dvh bg-background text-foreground">
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] md:hidden">
            <Link
              href="/"
              className="flex min-h-16 items-center gap-2 text-sm font-semibold text-foreground hover:no-underline"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/jobops-logo.svg" width={28} height={28} alt="" />
              JobOps
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={light ? "Use dark theme" : "Use light theme"}
              className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            >
              {light ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
            </button>
          </header>
          <header className="hidden border-b border-border bg-card md:block">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
              <Link
                href="/"
                className="flex items-center gap-3 text-lg font-semibold text-foreground hover:no-underline"
              >
                {/* Shared vector mark stays crisp in the header and browser tab. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/jobops-logo.svg" alt="" width={36} height={36} className="size-9" />
                My Jobs Workspace
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
                        "morph flex min-h-11 shrink-0 items-center gap-2 px-4 text-sm font-medium hover:no-underline",
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
                  href="/mail"
                  aria-label="Emails"
                  aria-current={emailsActive ? "page" : undefined}
                  className={cn(
                    "morph grid size-10 place-items-center hover:bg-muted",
                    emailsActive ? "bg-selected text-selected-foreground" : "text-muted-foreground",
                  )}
                >
                  <Inbox size={18} aria-hidden />
                </Link>
                <Link
                  href="/my-profile"
                  aria-label="My sites & profile"
                  className={cn(
                    "morph grid size-10 place-items-center hover:bg-muted",
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
                  className="morph grid size-10 place-items-center text-muted-foreground hover:bg-muted"
                  aria-label={light ? "Use dark theme" : "Use light theme"}
                >
                  {light ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
                </button>
              </div>
            </div>
          </header>
          <main
            id="main"
            className={cn(
              "mx-auto w-full min-w-0 px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] md:py-10",
              pathname === "/mail" ? "max-w-[1600px] md:px-6" : "max-w-6xl md:px-8",
            )}
          >
            {children}
          </main>
          <nav
            aria-label="Mobile navigation"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
          >
            <div className="mx-auto grid max-w-lg grid-cols-3">
              {[
                {
                  label: "Overview",
                  href: "/",
                  icon: ChartNoAxesCombined,
                  active: pathname === "/",
                },
                { label: "Mail", href: "/mail", icon: Inbox, active: emailsActive },
                {
                  label: "Applications",
                  href: "/applications",
                  icon: BriefcaseBusiness,
                  active: pathname.startsWith("/applications") && !emailsActive,
                },
              ].map(({ label, href, icon: Icon, active }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-medium hover:no-underline",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "relative flex h-7 w-16 items-center justify-center rounded-full",
                      active && "bg-selected text-selected-foreground",
                    )}
                  >
                    <Icon size={20} aria-hidden />
                    {href === "/mail" && attentionCount > 0 && (
                      <span className="absolute top-0 right-0 min-w-4 rounded-full bg-review px-1 text-[9px] text-review-foreground">
                        <span className="sr-only">Needs attention: </span>
                        {attentionCount}
                      </span>
                    )}
                  </span>
                  {label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </SnackbarProvider>
    </LoadingProvider>
  );
}
