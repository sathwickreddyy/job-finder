"use client";
import {Button} from "@/components/ui/button";
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <div className="space-y-4 p-8"><h1 className="text-xl font-semibold">This page could not load</h1><p className="text-muted-foreground">Check that PostgreSQL is running and migrations have been applied, then retry.</p><Button onClick={reset}>Retry page</Button></div>;}
