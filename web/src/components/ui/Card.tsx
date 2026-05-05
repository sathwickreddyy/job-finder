import { HTMLAttributes } from "react";
import { cn } from "./utils";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-surface border border-border rounded-xl p-4", className)}
      {...rest}
    />
  );
}
