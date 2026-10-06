import { useEffect, useSyncExternalStore, type FC } from 'react';
import { CURSOR_DESIGN, CURSOR_OVER } from '../game/skin';
import {
  getSimCursor,
  subscribeSimCursor,
  reportFollow,
  simCursorFollow,
  type SimCursorShape,
} from '../game/simCursor';

/**
 * Software-rendered engine cursor. The native cursor is hidden over the
 * stage (App redefines the --cur-* vars to 'none'); this element draws
 * the 32x32 sprig at the pointer's hotspot (0,0) in stage space, so it
 * scales with the stage exactly like the original game. Hover shape is
 * classified via the --cur-hover marker ('over' | 'normal' | 'hand')
 * declared next to each cursor rule. 'hand' zones (sys bar) keep the OS
 * cursor and hide the sim.
 */
const SimCursor: FC<{ enabled: boolean }> = ({ enabled }) => {
  const s = useSyncExternalStore(subscribeSimCursor, getSimCursor);

  useEffect(() => {
    if (!enabled) return;
    const frame = () => document.querySelector('.stage-frame') as HTMLElement | null;

    // Walk up to the frame reading the --cur-hover marker (custom props
    // inherit, so children inside a button share its value).
    const classify = (start: Element | null): { shape: SimCursorShape; nativeHand: boolean } => {
      const f = frame();
      let el: Element | null = start;
      while (el && el !== f?.parentElement) {
        const h = getComputedStyle(el).getPropertyValue('--cur-hover').trim();
        if (h === 'hand') return { shape: 'normal', nativeHand: true };
        if (h === 'over') return { shape: 'over', nativeHand: false };
        if (h === 'normal') return { shape: 'normal', nativeHand: false };
        if (el === f) break;
        el = el.parentElement;
      }
      return { shape: 'normal', nativeHand: false };
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const f = frame();
      if (!f) return;
      const r = f.getBoundingClientRect();
      if (
        e.clientX < r.left || e.clientX > r.right ||
        e.clientY < r.top || e.clientY > r.bottom
      ) {
        reportFollow(0, 0, { visible: false });
        return;
      }
      const x = (e.clientX - r.left) / (r.width / 800);
      const y = (e.clientY - r.top) / (r.height / 600);
      const { shape, nativeHand } = classify(document.elementFromPoint(e.clientX, e.clientY));
      reportFollow(x, y, { visible: true, shape, nativeHand });
    };

    const onLeave = () => {
      if (getSimCursor().mode === 'follow') simCursorFollow();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [enabled]);

  if (!enabled || !s.visible || s.nativeHand) return null;

  return (
    <img
      className="sim-cursor"
      src={s.shape === 'over' ? CURSOR_OVER : CURSOR_DESIGN}
      alt=""
      width={32}
      height={32}
      draggable={false}
      style={{ transform: `translate(${s.x}px, ${s.y}px)` }}
    />
  );
};

export default SimCursor;
