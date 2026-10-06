import { describe, it, expect } from 'vitest';
import { resolveShownFrame, frameIsPositioned, type ReadyFrame } from './dynLayerFrame';
import { layerScreenPlacement } from './metadata';

/** Snapshot of the 682->697 lave42_haruka cut: unpositioned 800x600 normal
 *  frame held while the positioned 1600x1200 _l master decodes. */
const NORMAL: ReadyFrame = {
  file: 'ev_haruka_h_01b', w: 800, h: 600,
  xpos: null, ypos: null, orx: null, ory: null,
};
const LARGE = 'ev_haruka_h_01b_l';

const mkReady = (over: Partial<ReadyFrame> = {}): ReadyFrame => ({
  file: LARGE, w: 1600, h: 1200, xpos: 200, ypos: 250,
  orx: null, ory: null, ...over,
});

describe('resolveShownFrame', () => {
  it('waits (full-stage fallback) before anything has decoded', () => {
    const s = resolveShownFrame(null, LARGE);
    expect(s.kind).toBe('wait');
  });

  it('holds the previous frame while a new file is still decoding', () => {
    const s = resolveShownFrame(NORMAL, LARGE);
    expect(s.kind).toBe('hold');
    if (s.kind !== 'hold') throw new Error('narrow');
    expect(s.frame.file).toBe('ev_haruka_h_01b');
  });

  it('shows the target frame once its own file is decoded', () => {
    const ready = mkReady();
    const s = resolveShownFrame(ready, LARGE);
    expect(s.kind).toBe('target');
    if (s.kind !== 'target') throw new Error('narrow');
    expect(s.frame.w).toBe(1600);
  });
});

describe('the held frame covers the stage with the OLD placement', () => {
  it('old 800x600 normal frame is unpositioned -> full-stage contain, no corner gap', () => {
    const held = resolveShownFrame(NORMAL, LARGE);
    if (held.kind !== 'hold') throw new Error('narrow');
    expect(frameIsPositioned(held.frame)).toBe(false);
  });

  it('never places the incoming 1600x1200 master with stale 800x600 dims', () => {
    // The buggy transient: new xpos/ypos math against the old natural size.
    const buggy = layerScreenPlacement({ xpos: 200, ypos: 250 }, 800, 600);
    expect(buggy).toEqual({ x: 200, y: 250 }); // black top-left 200x250 region

    // Correct end placement once the real 1600x1200 dims are known.
    const fixed = layerScreenPlacement({ xpos: 200, ypos: 250 }, 1600, 1200);
    expect(fixed).toEqual({ x: -200, y: -50 });
  });

  it('held positioned frame keeps its own xpos/ypos', () => {
    const prev = mkReady({ file: 'ev_prev_l', xpos: 40, ypos: 90 });
    const held = resolveShownFrame(prev, LARGE);
    if (held.kind !== 'hold') throw new Error('narrow');
    const p = layerScreenPlacement(held.frame, held.frame.w, held.frame.h);
    expect(p).toEqual(layerScreenPlacement({ xpos: 40, ypos: 90 }, 1600, 1200));
  });
});
