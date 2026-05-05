import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "./utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors " +
  "disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

const variants = {
  primary: "bg-accent text-black hover:bg-cyan-300",
  secondary: "bg-surface hover:bg-surface-hover border border-border",
  ghost: "hover:bg-surface-hover",
  danger: "bg-danger/20 text-danger hover:bg-danger/30 border border-danger/40",
};

const sizes = { sm: "h-7 px-2 text-xs", md: "h-9 px-3 text-sm" };

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
