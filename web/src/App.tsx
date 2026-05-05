import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import Dashboard from "./routes/Dashboard";
import Search from "./routes/Search";
import Tracker from "./routes/Tracker";
import Resume from "./routes/Resume";
import SettingsLayout from "./routes/settings/SettingsLayout";
import Profile from "./routes/settings/Profile";
import Companies from "./routes/settings/Companies";
import Scoring from "./routes/settings/Scoring";
import Sources from "./routes/settings/Sources";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/search" element={<Search />} />
        <Route path="/tracker" element={<Tracker />} />
        <Route path="/resume" element={<Resume />} />
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={<Profile />} />
          <Route path="companies" element={<Companies />} />
          <Route path="scoring" element={<Scoring />} />
          <Route path="sources" element={<Sources />} />
        </Route>
      </Route>
    </Routes>
  );
}
