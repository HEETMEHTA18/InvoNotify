"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a number toward its target with an ease-out count-up.
 * Used on the recovery dashboard so the Recovered ₹ visibly ticks up
 * the moment a payment webhook lands (the live demo moment).
 */
export function useCountUp(target: number, durationMs = 800): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;

    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (target - from) * eased;
      setValue(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    // requestAnimationFrame does not fire while the tab is hidden or otherwise
    // not compositing, which would leave the number frozen at its old value —
    // a dashboard opened in a background tab showed ₹0 until the figure next
    // changed. Timers still fire when hidden, so this settles the true value
    // either way: it is a no-op after a completed animation, and the only
    // thing that runs when frames never arrive.
    const settle = setTimeout(() => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      fromRef.current = target;
      setValue(target);
    }, durationMs + 250);

    return () => {
      clearTimeout(settle);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      fromRef.current = target;
    };
  }, [target, durationMs]);

  return value;
}

/**
 * Returns true for a short window whenever `value` increases — used to flash
 * the KPI card green when recovered amount grows in real time.
 */
export function useIncreaseFlash(value: number, windowMs = 1500): boolean {
  const prevRef = useRef(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (value <= prev) return;

    let cancelled = false;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    // Defer to the next frame — keeps the effect body free of sync setState.
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      setFlash(true);
      hideTimer = setTimeout(() => {
        if (!cancelled) setFlash(false);
      }, windowMs);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [value, windowMs]);

  return flash;
}