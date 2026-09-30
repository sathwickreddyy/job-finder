"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/actions";
export function ActionForm({action,children,className="space-y-4"}:{action:(state:ActionState,data:FormData)=>Promise<ActionState>;children:React.ReactNode;className?:string}) {
  const [state, formAction, pending] = useActionState(action, {});
  const router = useRouter();
  useEffect(()=>{ if(state.redirect) router.push(state.redirect); if(state.success) router.refresh(); },[state,router]);
  return <form action={formAction} className={className} aria-busy={pending}>
    {state.error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">{state.error}</div>}
    {state.success && <div role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400">{state.success}</div>}
    <fieldset disabled={pending} className="min-w-0 space-y-4">{children}</fieldset>
    {pending && <p role="status" className="text-sm text-muted-foreground">Saving…</p>}
  </form>;
}
