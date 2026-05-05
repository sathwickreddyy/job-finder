import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "./utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all " +
  "disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

const variants = {
  primary: "bg-accent text-slate-950 shadow-lg shadow-accent/15 hover:-translate-y-0.5 hover:bg-teal-200",
  secondary: "border border-border bg-surface hover:-translate-y-0.5 hover:bg-surface-hover",
  ghost: "hover:bg-surface-hover",
  danger: "border border-danger/40 bg-danger/15 text-danger hover:bg-danger/25",
};

const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm" };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "secondary", size = "md", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    />
  );
});
