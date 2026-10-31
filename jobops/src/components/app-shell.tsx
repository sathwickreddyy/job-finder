"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
export function AppShell({ children }: { children: ReactNode }) {
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
  if (pathname.startsWith("/gallery/simple") || pathname.startsWith("/gallery/companies"))
    return <main id="main">{children}</main>;
  return (
    <LoadingProvider>
      <SnackbarProvider>
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
              "mx-auto w-full min-w-0",
              pathname === "/gallery/mail" || pathname === "/mail"
                ? "max-w-[1600px] px-4 py-5 sm:px-6"
                : "max-w-6xl px-5 py-8 sm:px-8 sm:py-10",
            )}
          >
            {children}
          </main>
        </div>
      </SnackbarProvider>
    </LoadingProvider>
  );
}
