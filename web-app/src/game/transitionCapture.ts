// Debug tooling: sample the rendered stage across a transition, producing
// an LCP-filmstrip-like log of every sprite's geometry/opacity/animation
// state at fixed time points.
//
// Usage from the dev console:
//   __lavender.setDebugTimeScale(8)         // slow-mo all transitions
//   await __lavender.captureTransition()    // advance once, sample 16×100ms
//   __lavender.downloadLastCapture()        // save JSON
//   await __lavender.captureTransition({ images: true, samples: 24 })

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDebugTimeScale } from './debugTiming';

export interface CaptureOptions {
  /** Advance to the next page before sampling (default true). */
  advance?: boolean;
  /** Number of samples to take (default 16). */
  samples?: number;
  /** Milliseconds between samples (default 100 wall-clock ms). */
  intervalMs?: number;
  /** Include per-sprite canvas data URLs (heavy; default false). */
  images?: boolean;
}

interface CaptureSample {
  t: number;
  pointer: number;
  isWaiting: boolean;
  stageTransition: unknown;
  chars: Array<Record<string, unknown>>;
  bg: Record<string, unknown> | null;
}

export interface CaptureResult {
  startedAt: string;
  scenario: string;
  pointer: number;
  timeScale: number;
  options: CaptureOptions;
  samples: CaptureSample[];
}

let lastResult: CaptureResult | null = null;

function rectInStage(el: Element, stage: DOMRect) {
  const r = el.getBoundingClientRect();
  const k = 800 / stage.width; // stage px per viewport px
  return {
    x: +(r.x - stage.x).toFixed(1),
    y: +(r.y - stage.y).toFixed(1),
    w: +r.width.toFixed(1),
    h: +r.height.toFixed(1),
    sx: +(r.width * k).toFixed(1),
    sy: +(r.height * k).toFixed(1),
  };
}

function sampleStage(runner: any, images: boolean): CaptureSample {
  const frame = document.querySelector('.stage-frame')?.getBoundingClientRect();
  const stageEl = document.querySelector('.game-stage');
  const stage = (frame ?? stageEl?.getBoundingClientRect()) as DOMRect;
  const L = (window as any).__lavender ?? runner;

  const chars = [...document.querySelectorAll('.char-sprite')].map((el) => {
    const node = el as HTMLElement;
    const cs = getComputedStyle(node);
    const anims = node.getAnimations?.().map((a: Animation) => ({
      name: (a as any).animationName || node.dataset.char || 'waapi',
      state: a.playState,
      time: a.currentTime as number | null,
      duration: (a.effect?.getTiming?.().duration ?? null) as number | null,
    }));
    const canvas = node.querySelector('canvas');
    const ghost = node.querySelector('img[src^="data:"]');
    const state = L?.stage?.chars?.[node.dataset.char || ''];
    return {
      name: node.dataset.char,
      rect: rectInStage(node, stage),
      opacity: +cs.opacity,
      transform: cs.transform,
      zIndex: cs.zIndex,
      anims,
      state: state ? {
        pose: state.pose, dress: state.dress, diff: state.diff, face: state.face,
        visible: state.visible, leaving: !!state.leaving, front: state.front,
        xpos: state.xpos,
        enterAnim: state.enterAnim, exitAnim: state.exitAnim,
      } : null,
      canvas: canvas ? {
        opacity: +getComputedStyle(canvas).opacity,
        w: (canvas as HTMLCanvasElement).width, h: (canvas as HTMLCanvasElement).height,
        url: images ? (canvas as HTMLCanvasElement).toDataURL() : undefined,
      } : null,
      ghost: ghost ? { opacity: +getComputedStyle(ghost).opacity } : null,
    };
  });

  const bgImg = [...(stageEl?.querySelectorAll('img') ?? [])].find(
    (i) => (i as HTMLImageElement).src.includes('/bgimage'),
  ) as HTMLImageElement | undefined;
  const bg = bgImg ? {
    rect: rectInStage(bgImg, stage),
    transform: getComputedStyle(bgImg).transform,
    nat: `${bgImg.naturalWidth}x${bgImg.naturalHeight}`,
    eff: L?.stage?.bgEffect ?? null,
  } : null;

  return {
    t: 0,
    pointer: L?.pointer ?? -1,
    isWaiting: !!L?.isWaiting,
    stageTransition: L?.stageTransition ?? null,
    chars,
    bg,
  };
}

export async function captureTransition(runner: any, opts: CaptureOptions = {}): Promise<CaptureResult> {
  const { advance = true, samples = 16, intervalMs = 100, images = false } = opts;
  if (advance && typeof runner?.advance === 'function') runner.advance();

  const t0 = performance.now();
  const list: CaptureSample[] = [];
  for (let i = 0; i < samples; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const s = sampleStage(runner, images);
    s.t = +(performance.now() - t0).toFixed(1);
    list.push(s);
  }

  const L = (window as any).__lavender ?? runner;
  lastResult = {
    startedAt: new Date().toISOString(),
    scenario: L?.currentScenario ?? '',
    pointer: L?.pointer ?? -1,
    timeScale: getDebugTimeScale(),
    options: { advance, samples, intervalMs, images },
    samples: list,
  };
  return lastResult;
}

export function downloadLastCapture(filename?: string) {
  if (!lastResult) throw new Error('No capture yet; call await __lavender.captureTransition() first.');
  const blob = new Blob([JSON.stringify(lastResult, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || `lavender-transition-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  return a.download;
}
