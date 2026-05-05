import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-border bg-surface p-5 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          {eyebrow && (
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
              {eyebrow}
            </div>
          )}
          <h2 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
            {title}
          </h2>
          {description && (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
              {description}
            </p>
          )}
          {meta && <div className="mt-4">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}
