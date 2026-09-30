import type {Metadata} from "next";
import {AppShell} from "@/components/app-shell";
import "./globals.css";
export const metadata:Metadata={title:{default:"JobOps",template:"%s · JobOps"},description:"Your personal career workbench"};
export const dynamic="force-dynamic";
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body><AppShell>{children}</AppShell></body></html>;}
