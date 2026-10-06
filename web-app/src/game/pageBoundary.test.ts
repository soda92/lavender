import { describe, it, expect } from 'vitest';
import { boundaryStartsFresh, type BoundaryInst } from './pageBoundary';

// lave34: spoken line ends in line_feed, then a transition block, then
// NARRATION text starts a new message (the retained speaker — and its FACE
// bust — must be cleared during silent replay).
const spokenThenNarration: BoundaryInst[] = [
  { type: 'text' },        // 0 【レイカ】…
  { type: 'line_feed' },   // 1 boundary
  { type: 'command' },     // 2 begintrans
  { type: 'command' },     // 3 ...
  { type: 'text' },        // 4 narration 「真夏の道場は…」
];

// [*] inline split compiles as text, line_feed, wait_click(inline), text —
// the following text belongs to the SAME open page.
const inlineSplit: BoundaryInst[] = [
  { type: 'text' },        // 0
  { type: 'line_feed' },   // 1
  { type: 'wait_click', inline: true }, // 2
  { type: 'text' },        // 3 continuation
];

describe('boundaryStartsFresh — silent replay message boundaries', () => {
  it('line_feed before narration starts a fresh message (speaker clears)', () => {
    expect(boundaryStartsFresh(spokenThenNarration, 2, 'line_feed')).toBe(true);
  });

  it('line_feed immediately followed by wait_click keeps the page open', () => {
    expect(boundaryStartsFresh(inlineSplit, 2, 'line_feed')).toBe(false);
  });

  it('skips multiple stacked line_feeds before deciding', () => {
    const data: BoundaryInst[] = [
      { type: 'text' },
      { type: 'line_feed' }, // 1 <- consumed, ptrAfter = 2
      { type: 'line_feed' }, // 2
      { type: 'wait_click', inline: true },
      { type: 'text' },
    ];
    expect(boundaryStartsFresh(data, 2, 'line_feed')).toBe(false);
    const open: BoundaryInst[] = [
      { type: 'text' }, { type: 'line_feed' }, { type: 'line_feed' }, { type: 'text' },
    ];
    expect(boundaryStartsFresh(open, 2, 'line_feed')).toBe(true);
  });

  it('non-inline wait_click starts fresh; inline [*] does not', () => {
    expect(boundaryStartsFresh([], 0, 'wait_click', false)).toBe(true);
    expect(boundaryStartsFresh([], 0, 'wait_click', true)).toBe(false);
  });

  it('line_feed at the end of the stream starts fresh (next page)', () => {
    const data: BoundaryInst[] = [{ type: 'text' }, { type: 'line_feed' }];
    expect(boundaryStartsFresh(data, 2, 'line_feed')).toBe(true);
  });
});
