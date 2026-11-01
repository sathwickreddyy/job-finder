import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "My Jobs Workspace", template: "%s · My Jobs Workspace" },
  applicationName: "My Jobs Workspace",
  description:
    "Your personal job search workspace for openings, applications, resumes and recruiting mail.",
  icons: { icon: { url: "/jobops-logo.svg", type: "image/svg+xml" } },
};
export const dynamic = "force-dynamic";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.dataset.theme=localStorage.getItem('jobops-theme')==='light'?'light':'dark'}catch{}",
          }}
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
