import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "./utils";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "h-9 rounded-full border border-border bg-black/15 px-3 text-xs font-medium text-text",
          "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    );
  },
);
