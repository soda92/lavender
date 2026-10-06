import type { OriginX, OriginY } from './metadata';

/**
 * A decoded dynamic-layer bitmap plus the placement inputs that were active
 * when it became current. Kept by LayerView so a file swap can keep showing
 * the OLD frame (with the OLD placement) until the NEW file has decoded.
 */
export interface ReadyFrame {
  file: string;
  w: number;
  h: number;
  xpos: number | null;
  ypos: number | null;
  orx: number | null;
  ory: number | null;
  afx?: OriginX;
  afy?: OriginY;
}

export type ShownFrame =
  | { kind: 'wait'; frame: null }
  | { kind: 'hold'; frame: ReadyFrame }
  | { kind: 'target'; frame: ReadyFrame };

/**
 * Which bitmap a dynamic layer must paint RIGHT NOW.
 *
 * A positioned file swap (e.g. event `normal` 800x600 -> `_l` 1600x1200 with
 * xpos/ypos) must never be placed with the previous file's natural size:
 * the browser lays the incoming <img> out at its new intrinsic size the
 * moment its header arrives, one frame BEFORE React learns the new dims,
 * which painted the 2x master at (xpos, ypos) and exposed a black corner.
 * Until the new file is decoded we keep the previous frame on screen.
 */
export function resolveShownFrame(ready: ReadyFrame | null, file: string): ShownFrame {
  if (!ready) return { kind: 'wait', frame: null };
  if (ready.file === file) return { kind: 'target', frame: ready };
  return { kind: 'hold', frame: ready };
}

/** Whether a frame carries scripted placement (vs full-stage contain). */
export function frameIsPositioned(f: ReadyFrame): boolean {
  return f.xpos != null || f.ypos != null;
}
