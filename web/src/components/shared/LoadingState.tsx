export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-5 text-sm text-text-muted">
      <span className="h-3 w-3 animate-pulse rounded-full bg-accent shadow-lg shadow-accent/30" />
      {label}
    </div>
  );
}
