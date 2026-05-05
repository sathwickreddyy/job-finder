import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "./utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-2xl border border-border bg-black/15 px-3.5 text-sm text-text shadow-inner shadow-black/10",
          "placeholder:text-text-faint focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
          className,
        )}
        {...rest}
      />
    );
  },
);
