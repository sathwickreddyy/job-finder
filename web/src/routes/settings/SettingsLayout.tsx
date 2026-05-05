import { NavLink, Outlet } from "react-router-dom";
import { Building2, SlidersHorizontal, UserRound, Workflow } from "lucide-react";

const TABS = [
  {
    to: "/settings/profile",
    label: "Profile",
    hint: "Candidate defaults",
    icon: UserRound,
  },
  { to: "/settings/companies", label: "Companies", hint: "ATS targets", icon: Building2 },
  {
    to: "/settings/scoring",
    label: "Scoring",
    hint: "Priority rules",
    icon: SlidersHorizontal,
  },
  { to: "/settings/sources", label: "Sources", hint: "Fetch providers", icon: Workflow },
];

export default function SettingsLayout() {
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="rounded-[2rem] border border-border bg-surface p-4 shadow-xl shadow-black/5 backdrop-blur-xl lg:sticky lg:top-8 lg:self-start">
        <div className="mb-4 px-2">
          <div className="text-lg font-semibold tracking-tight">Settings</div>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            Tune the data that drives scoring, source fetches, and resume tailoring.
          </p>
        </div>
        <nav className="grid gap-2 text-sm">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              aria-label={t.label}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 rounded-2xl border px-3 py-3 transition-colors",
                  isActive
                    ? "border-border-strong bg-surface text-text"
                    : "border-transparent text-text-muted hover:border-border hover:bg-surface-hover hover:text-text",
                ].join(" ")
              }
            >
              {({ isActive }) => {
                const Icon = t.icon;
                return (
                  <>
                    <span
                      className={[
                        "flex h-9 w-9 items-center justify-center rounded-xl",
                        isActive
                          ? "bg-accent text-slate-950"
                          : "bg-black/15 text-text-faint",
                      ].join(" ")}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block font-medium">{t.label}</span>
                      <span
                        aria-hidden="true"
                        className="block text-xs text-text-faint"
                      >
                        {t.hint}
                      </span>
                    </span>
                  </>
                );
              }}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
