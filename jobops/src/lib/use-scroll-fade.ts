"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const FADE = "28px";

/** Mask for a horizontal scroller: fade only the edges that hide more content. */
export function fadeMask(start: boolean, end: boolean): CSSProperties | undefined {
  if (!start && !end) return undefined;
  const image = `linear-gradient(to right, ${start ? "transparent" : "#000"}, #000 ${
    start ? FADE : "0px"
  }, #000 calc(100% - ${end ? FADE : "0px"}), ${end ? "transparent" : "#000"})`;
  return { maskImage: image, WebkitMaskImage: image };
}

/**
 * Tracks whether a horizontal scroller has hidden content on either side, so the
 * cut-off edge can fade out instead of slicing a label or column in half.
 */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);
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
  return { ref, style: fadeMask(edges.start, edges.end), edges };
}
