// Software cursor store. The SimCursor component renders the engine's
// cur_normal/cur_over art inside the scaled stage and follows the real
// mouse by default. The same cursor can be driven programmatically
// (tests / debug automation); any real mouse movement hands control back.

export type SimCursorShape = 'normal' | 'over';

export interface SimCursorState {
  /** follow = tracks the real pointer; manual = positioned via moveTo() */
  mode: 'follow' | 'manual';
  /** Position in stage coordinates (800x600). */
  x: number;
  y: number;
  visible: boolean;
  shape: SimCursorShape;
  /** Over a native-hand zone (sys bar): the OS cursor is shown instead. */
  nativeHand: boolean;
}

const initial: SimCursorState = {
  mode: 'follow',
  x: 0,
  y: 0,
  visible: false,
  shape: 'normal',
  nativeHand: false,
};

let state: SimCursorState = { ...initial };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

export function getSimCursor(): SimCursorState {
  return state;
}

export function subscribeSimCursor(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Internal: SimCursor reports real-pointer tracking here. */
export function reportFollow(
  x: number,
  y: number,
  patch?: Partial<Pick<SimCursorState, 'visible' | 'shape' | 'nativeHand'>>,
) {
  state = { ...state, mode: 'follow', x, y, ...patch };
  emit();
}

/** Show the cursor at stage coordinates (test/debug automation). */
export function simCursorMoveTo(x: number, y: number, shape: SimCursorShape = 'normal') {
  state = { ...state, mode: 'manual', x, y, shape, visible: true, nativeHand: false };
  emit();
}

/** Hand control back to the real mouse (hidden until it next moves). */
export function simCursorFollow() {
  state = { ...state, mode: 'follow', visible: false };
  emit();
}
