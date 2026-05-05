export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-text-muted text-sm">{title}</p>
      {hint && <p className="text-text-faint text-xs mt-2">{hint}</p>}
    </div>
  );
}
