"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

/** Fades only the edges of a scroll area that hide more content. */
export function useEdgeFade<T extends HTMLElement>(axis: "x" | "y") {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pos = axis === "x" ? el.scrollLeft : el.scrollTop;
    const size = axis === "x" ? el.clientWidth : el.clientHeight;
    const total = axis === "x" ? el.scrollWidth : el.scrollHeight;
    const start = pos > 1;
    const end = pos + size < total - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [axis]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [update]);
  const direction = axis === "x" ? "to right" : "to bottom";
  const fade = "24px";
  const style: CSSProperties | undefined =
    edges.start || edges.end
      ? {
          maskImage: `linear-gradient(${direction}, ${edges.start ? "transparent" : "#000"}, #000 ${
            edges.start ? fade : "0px"
          }, #000 calc(100% - ${edges.end ? fade : "0px"}), ${edges.end ? "transparent" : "#000"})`,
        }
      : undefined;
  return { ref, style, update };
}
