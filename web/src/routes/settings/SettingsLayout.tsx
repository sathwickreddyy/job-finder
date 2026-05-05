import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  { to: "/settings/profile", label: "Profile" },
  { to: "/settings/companies", label: "Companies" },
  { to: "/settings/scoring", label: "Scoring" },
  { to: "/settings/sources", label: "Sources" },
];

export default function SettingsLayout() {
  return (
    <div className="flex gap-8">
      <aside className="w-44 space-y-2 text-sm">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `block px-2 py-1 rounded ${isActive ? "bg-surface text-text" : "text-text-muted hover:text-text"}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </aside>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
