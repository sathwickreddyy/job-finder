import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "./utils";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "h-8 rounded-md border border-border bg-surface px-2 text-xs text-text",
          "focus:outline-none focus:border-accent/50",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    );
  },
);
