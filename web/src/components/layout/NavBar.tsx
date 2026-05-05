import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/search", label: "Search" },
  { to: "/tracker", label: "Tracker" },
  { to: "/resume", label: "Resume" },
  { to: "/settings", label: "Settings" },
];

export function NavBar() {
  return (
    <header className="flex items-center gap-6 px-6 py-4 border-b border-border">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded bg-gradient-to-br from-accent to-blue-500 flex items-center justify-center text-black font-bold text-xs">
          jf
        </span>
        <span className="font-semibold tracking-tight">job-finder</span>
      </div>
      <nav className="flex items-center gap-5 text-sm text-text-muted">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) =>
              isActive ? "text-text font-medium" : "hover:text-text"
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
