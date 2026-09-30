"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

const navigation = [
  ["Today", "/today", "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z"],
  ["Jobs", "/jobs", "M3 7h18v14H3zM8 7V3h8v4M3 12h18M10 12v3h4v-3"],
  ["Applications", "/applications", "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"],
  ["Resumes", "/resumes", "M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"],
  ["Profiles", "/profiles", "M8 7a4 4 0 108 0 4 4 0 10-8 0M4 21v-2a8 8 0 0116 0v2"],
  ["Contacts", "/contacts", "M4 3h16v18H4zM8 8a3 3 0 106 0 3 3 0 10-6 0M7 18v-2a4 4 0 018 0v2"],
  ["Mail", "/mail", "M3 5h18v14H3zM3 5l9 7 9-7"],
  ["Missions", "/missions", "M4 4h16v16H4zM8 8l2 2 4-4M8 15h8"],
  ["Settings", "/settings", "M12 8a4 4 0 100 8 4 4 0 100-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"],
] as const;

function Icon({ path }: { path: string }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("jobops-theme", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("jobops-theme", callback); };
}
function clientTheme() { return localStorage.getItem("jobops-theme") === "light"; }
function serverTheme() { return false; }

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const light = useSyncExternalStore(subscribeTheme, clientTheme, serverTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
  }, [light]);
  function toggleTheme() {
    const next = !light;
    localStorage.setItem("jobops-theme", next ? "light" : "dark");
    document.documentElement.dataset.theme = next ? "light" : "dark";
    window.dispatchEvent(new Event("jobops-theme"));
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <aside className="sidebar">
      <Link href="/today" className="brand"><span className="brand-mark">J</span>JobOps</Link>
      <nav aria-label="Primary" className="navigation">{navigation.map(([label, href, path]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`) || (href === "/today" && pathname === "/");
        return <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><Icon path={path} />{label}</Link>;
      })}</nav>
      <div className="sidebar-bottom"><p className="sidebar-note">Your career workspace.<br />Every action stays in your control.</p><button type="button" onClick={toggleTheme} className="theme-button">{light ? "☾ Dark appearance" : "☼ Light appearance"}</button><Link href="/gallery" className="button-quiet" style={{ marginTop: 10, fontSize: 12 }}>Component gallery</Link></div>
    </aside>
    <div className="workspace"><header className="topbar"><form action="/jobs" className="global-search"><svg className="global-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></svg><input name="q" aria-label="Search jobs" placeholder="Search jobs, companies, or skills…" type="search" /></form><span className="workspace-label"><span className="status-dot" />Personal workspace</span></header><main className="page-content" id="main">{children}</main></div>
  </div>;
}
