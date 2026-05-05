import { HTMLAttributes } from "react";
import { cn } from "./utils";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-surface p-5 shadow-xl shadow-black/5 backdrop-blur-xl",
        className,
      )}
      {...rest}
    />
  );
}
