import { NavLink } from "react-router-dom";
import {
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  Search,
  Settings,
  Target,
} from "lucide-react";

const LINKS = [
  { to: "/", label: "Dashboard", hint: "Daily focus", icon: LayoutDashboard },
  { to: "/search", label: "Search", hint: "Find leads", icon: Search },
  { to: "/tracker", label: "Tracker", hint: "Pipeline", icon: Target },
  { to: "/resume", label: "Resume", hint: "Tailor assets", icon: FileText },
  { to: "/settings", label: "Settings", hint: "Tune sources", icon: Settings },
];

export function NavBar() {
  return (
    <header className="relative z-20 border-b border-border bg-black/15 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:block lg:px-5 lg:py-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent via-emerald-300 to-accent-amber text-sm font-black text-slate-950 shadow-lg shadow-accent/10">
            jf
          </span>
          <div>
            <div className="font-semibold tracking-tight">job-finder</div>
            <div className="text-xs text-text-muted">Local job search cockpit</div>
          </div>
        </div>
        <div className="hidden rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium text-text-muted lg:mt-6 lg:inline-flex">
          <BriefcaseBusiness className="mr-1.5 h-3.5 w-3.5 text-accent" />
          private workspace
        </div>
      </div>
      <nav className="flex gap-2 overflow-x-auto px-4 pb-4 text-sm text-text-muted sm:px-6 lg:block lg:space-y-2 lg:px-5">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) =>
              [
                "group flex min-w-max items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all lg:min-w-0",
                isActive
                  ? "border-border-strong bg-surface text-text shadow-lg shadow-black/10"
                  : "border-transparent hover:border-border hover:bg-surface-hover hover:text-text",
              ].join(" ")
            }
          >
            {({ isActive }) => {
              const Icon = l.icon;
              return (
                <>
                  <span
                    className={[
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                      isActive
                        ? "bg-accent text-slate-950"
                        : "bg-surface text-text-muted group-hover:text-text",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="lg:block">
                    <span className="block font-medium leading-tight">{l.label}</span>
                    <span className="hidden text-xs text-text-faint lg:block">{l.hint}</span>
                  </span>
                </>
              );
            }}
          </NavLink>
        ))}
      </nav>
      <div className="hidden px-5 pb-6 lg:absolute lg:bottom-0 lg:block">
        <div className="rounded-3xl border border-border bg-surface p-4 text-xs text-text-muted">
          <div className="mb-1 font-semibold text-text">Workflow tip</div>
          Run Search, shortlist P0/P1 jobs, then tailor your resume from the expanded job row.
        </div>
      </div>
    </header>
  );
}
