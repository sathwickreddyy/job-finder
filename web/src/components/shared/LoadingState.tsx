export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <p className="text-text-muted text-sm py-8">{label}</p>;
}
