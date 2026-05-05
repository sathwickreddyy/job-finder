import { Outlet } from "react-router-dom";
import { NavBar } from "./NavBar";

export function AppShell() {
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1 px-6 py-6 max-w-[1400px] w-full mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
