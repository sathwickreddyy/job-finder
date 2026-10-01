"use client";

import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  createLoadingController,
  HIDDEN,
  type LoadingController,
  type LoadingSnapshot,
} from "./controller";
import { formNavigationTarget, isNewLocation, labelForPath, navigationTarget } from "./routes";

const LoadingContext = createContext<LoadingController | null>(null);

export function useLoading() {
  return useContext(LoadingContext);
}

/** Shows the popup while `active` is true (for example a form's pending state). */
export function useLoadingTask(active: boolean, label: string) {
  const loading = useLoading();
  useEffect(() => {
    if (!loading || !active) return;
    const task = loading.start(label);
    return () => loading.finish(task);
  }, [loading, active, label]);
}

/** Loader A from /gallery/home: a dialog with a Material linear progress bar over a blurred page. */
function LoadingPopup({ snapshot }: { snapshot: LoadingSnapshot }) {
  if (!snapshot.visible) return null;
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 grid place-items-center bg-scrim backdrop-blur-md",
        snapshot.closing ? "animate-fade-out" : "animate-fade-in",
      )}
    >
      <div
        role="status"
        aria-live="polite"
        className="w-[min(360px,calc(100vw-32px))] animate-pop rounded-panel border border-border bg-popover p-6 shadow-surface"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary font-semibold text-primary-foreground">
            J
          </span>
          <p className="m-0 font-semibold">{snapshot.label}</p>
        </div>
        <div
          role="progressbar"
          aria-label={snapshot.label}
          className="mt-5 h-1 overflow-hidden rounded-full bg-selected"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${snapshot.progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function NavigationTracker({ loading }: { loading: LoadingController }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const lastLocation = useRef<string | null>(null);
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = navigationTarget(event, anchor, window.location);
      if (url) loading.navigate(labelForPath(url.pathname));
    }
    function onSubmit(event: SubmitEvent) {
      // Forms with their own handling (ActionForm, server actions) prevent the native submit.
      if (event.defaultPrevented || !(event.target instanceof HTMLFormElement)) return;
      if (formNavigationTarget(event.target, window.location)) loading.navigate("Searching");
    }
    function onPopState() {
      const current = window.location.href;
      // Back/Forward also fires for anchors; those never trigger a route completion effect.
      if (lastLocation.current && isNewLocation(current, { href: lastLocation.current }))
        loading.navigate(labelForPath(window.location.pathname));
      lastLocation.current = current;
    }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) loading.reset();
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [loading]);
  useEffect(() => {
    lastLocation.current = window.location.href;
    loading.arrived();
  }, [loading, pathname, search]);
  return null;
}

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [loading] = useState(createLoadingController);
  const snapshot = useSyncExternalStore(loading.subscribe, loading.getSnapshot, () => HIDDEN);
  return (
    <LoadingContext.Provider value={loading}>
      <div inert={snapshot.visible}>{children}</div>
      <Suspense fallback={null}>
        <NavigationTracker loading={loading} />
      </Suspense>
      <LoadingPopup snapshot={snapshot} />
    </LoadingContext.Provider>
  );
}
