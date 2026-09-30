"use client";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/actions";
export function ActionForm({action,children,className="space-y-4"}:{action:(state:ActionState,data:FormData)=>Promise<ActionState>;children:React.ReactNode;className?:string}) {
  const [state, formAction, pending] = useActionState(action, {});
  const router = useRouter();
  const handled = useRef<ActionState | null>(null);
  useEffect(()=>{
    if (handled.current === state) return;
    handled.current = state;
    if(state.redirect) router.push(state.redirect);
    // Server actions already revalidate their pages; another refresh can rerun this effect.
  },[state,router]);
  return <form action={formAction} className={className} aria-busy={pending} onSubmit={(event) => {
    // Preserve entered values on validation errors instead of React's native action reset.
    event.preventDefault();
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(data));
  }}>
    {state.error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">{state.error}</div>}
    {state.success && <div role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400">{state.success}</div>}
    <fieldset disabled={pending} className="min-w-0 space-y-4">{children}</fieldset>
    {pending && <p role="status" className="text-sm text-muted-foreground">Saving…</p>}
  </form>;
}
