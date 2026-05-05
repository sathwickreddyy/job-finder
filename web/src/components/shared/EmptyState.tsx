export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-black/10 px-6 py-14 text-center">
      <p className="text-sm font-medium text-text">{title}</p>
      {hint && <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-text-muted">{hint}</p>}
    </div>
  );
}
