import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Animates a number toward `to` whenever it changes. */
export function CountUp({ to, duration = 700, format = (n: number) => n.toLocaleString() }: { to: number; duration?: number; format?: (n: number) => string }) {
  const [value, setValue] = useState(to);
  const shownRef = useRef(to);
  const first = useRef(true);

  useEffect(() => {
    // On mount inside an overlay, count from zero for drama; otherwise from the last shown value.
    const from = first.current && duration >= 1000 ? 0 : shownRef.current;
    first.current = false;
    if (from === to || prefersReducedMotion()) {
      shownRef.current = to;
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * eased);
      shownRef.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);

  return <>{format(value)}</>;
}
