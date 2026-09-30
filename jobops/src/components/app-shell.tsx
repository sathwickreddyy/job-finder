"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { BriefcaseBusiness, Home, Inbox, Moon, Settings2, Sun, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { label: "Home", href: "/", icon: Home, routes: ["/tasks"] },
  {
    label: "Opportunities",
    href: "/opportunities",
    icon: BriefcaseBusiness,
    routes: ["/jobs", "/applications", "/contacts", "/import"],
  },
  { label: "Inbox", href: "/inbox", icon: Inbox, routes: ["/mail"] },
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
  const profileActive = ["/my-profile", "/resumes", "/profiles"].some((p) =>
    pathname.startsWith(p),
  );
  const navClass = (active: boolean) =>
    cn(
      "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted hover:no-underline",
      active ? "bg-selected text-link" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[13rem_minmax(0,1fr)]">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="glass flex flex-col gap-5 border-b border-border bg-rail p-4 md:sticky md:top-0 md:h-dvh md:border-r md:border-b-0 md:px-5 md:py-8">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 px-2 text-xl font-semibold tracking-tight text-foreground hover:no-underline"
          >
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-base text-primary-foreground">
              J
            </span>
            JobOps
          </Link>
          <span className="text-xs text-muted-foreground md:hidden">India · IST</span>
        </div>
        <nav aria-label="Primary" className="flex flex-wrap gap-1 md:mt-6 md:flex-col">
          {navigation.map(({ label, href, icon: Icon, routes }) => {
            const active = pathname === href || routes.some((p) => pathname.startsWith(p));
            return (
              <Link
                key={href}
                href={href}
                className={navClass(active)}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={18} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-wrap items-center gap-1 md:mt-auto md:flex-col md:items-stretch">
          <Link
            href="/my-profile"
            className={navClass(profileActive)}
            aria-current={profileActive ? "page" : undefined}
          >
            <UserRound size={18} aria-hidden />
            My profile
          </Link>
          <Link href="/settings" className={navClass(pathname === "/settings")}>
            <Settings2 size={18} aria-hidden />
            Settings
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            className={cn(navClass(false), "text-left")}
            aria-label={light ? "Use dark theme" : "Use colourful light theme"}
          >
            {light ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
            {light ? "Dark theme" : "Colourful light"}
          </button>
          <p className="mt-5 hidden px-3 text-xs leading-relaxed text-muted-foreground md:block">
            Your search in India.
            <br />
            Your next move.
          </p>
        </div>
      </aside>
      <main
        id="main"
        className="mx-auto w-full min-w-0 max-w-7xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12"
      >
        {children}
      </main>
    </div>
  );
}
