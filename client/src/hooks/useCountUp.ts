import { useEffect, useRef, useState } from "react";

/**
 * useCountUp — animates a numeric value from its previous state to the new one.
 * Works with integers and floats. Respects prefixes/suffixes via the format fn.
 */
export function useCountUp(
  target: number,
  duration = 600,
  format?: (n: number) => string
): string {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);
  const raf = useRef<number>(0);

  useEffect(() => {
    const start = prev.current;
    const end = target;
    if (start === end) return;

    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setDisplay(current);

      if (progress < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        prev.current = end;
      }
    };

    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  if (format) return format(display);
  // Smart decimal inference: if target has decimals, preserve them
  const decimals = String(target).includes(".") ? String(target).split(".")[1].length : 0;
  return display.toFixed(Math.min(decimals, 4));
}
