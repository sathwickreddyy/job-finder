import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "./utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm",
          "placeholder:text-text-faint focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-[var(--ring)]",
          className,
        )}
        {...rest}
      />
    );
  },
);
