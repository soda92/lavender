/**
 * Message-boundary semantics for the compiled instruction stream.
 *
 * In normal play every text node pauses for a click; the click path marks the
 * next message fresh (clearing the speaker / name target) unless the page is
 * a [*]-split continuation (`pageContinues`). Silent replay (hash loads,
 * navigator seeks) never clicks, so it must derive the same information from
 * the boundary instructions it skips.
 */
export interface BoundaryInst {
  type: string;
  inline?: boolean;
}

export type MessageBoundary = 'line_feed' | 'wait_click';

/**
 * After consuming a boundary instruction (with `ptrAfter` pointing at the
 * following instruction), does the next text node start a FRESH message?
 * A fresh message without a 【name】 prefix is narration and must clear the
 * retained speaker (the engine hides the face window for it).
 *
 * - non-inline `wait_click`: always a new message;
 * - inline `wait_click` ([*] split): same open page;
 * - `line_feed`: new message unless an inline split compiles as
 *   line_feed(s) immediately followed by `wait_click`.
 */
export function boundaryStartsFresh(
  data: ReadonlyArray<BoundaryInst>,
  ptrAfter: number,
  boundary: MessageBoundary,
  inline?: boolean,
): boolean {
  if (boundary === 'wait_click') return !inline;
  let i = ptrAfter;
  while (data[i]?.type === 'line_feed') i++;
  return data[i]?.type !== 'wait_click';
}
