import { useEffect, useState } from 'react';

// Debug helper: multiplies all engine-driven transition durations so
// mid-transition frames can be inspected / captured. 1 = engine speed.
// Affects char enter/exit/pose crossfades and their prune timers; seek and
// skip are always instant regardless of the scale.
let timeScale = 1;
const listeners = new Set<() => void>();

export const getDebugTimeScale = (): number => timeScale;

export function setDebugTimeScale(v: number): number {
  timeScale = Math.max(1, Number(v) || 1);
  listeners.forEach((fn) => fn());
  return timeScale;
}

export function subscribeDebugTimeScale(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Scale an engine duration (ms) by the current debug factor. */
export function debugMs(ms: number): number {
  return Math.round(ms * timeScale);
}

/** React hook: re-renders the component when the factor changes. */
export function useDebugTimeScale(): number {
  const [s, setS] = useState(timeScale);
  useEffect(() => subscribeDebugTimeScale(() => setS(getDebugTimeScale())), []);
  return s;
}
