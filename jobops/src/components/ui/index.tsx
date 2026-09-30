import { cn, label } from "@/lib/utils";
export { Button } from "./button";
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
export function Panel({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <section className={cn("glass rounded-card border border-border bg-card p-5", className)}>
      {title && <h2 className="mb-4 text-base font-semibold">{title}</h2>}
      {children}
    </section>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <h2 className="font-semibold">{title}</h2>
      <p className="mx-auto my-3 max-w-md text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const tone = /FAILED|REJECTED|INVALID|CANCELLED/.test(status)
    ? "badge-red"
    : /REVIEW|WAITING|UNKNOWN|DRAFT|PREPARING/.test(status)
      ? "badge-amber"
      : /COMPLETED|OFFER|VALID|ACTIVE|CURRENT/.test(status)
        ? "badge-teal"
        : "badge-blue";
  return <span className={cn("badge", tone)}>{label(status)}</span>;
}
export function Field({
  label: fieldLabel,
  name,
  children,
  hint,
  ...props
}: { label: string; name: string; children?: React.ReactNode; hint?: string } & Omit<
  React.ComponentProps<"input">,
  "name"
>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={props.id ?? name} className="block text-sm font-medium">
        {fieldLabel}
      </label>
      {children ?? <input id={name} name={name} {...props} />}{" "}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
