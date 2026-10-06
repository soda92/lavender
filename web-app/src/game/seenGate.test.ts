import { describe, it, expect } from 'vitest';
import { itemSeen, anySeen } from './seenGate';

describe('itemSeen — gallery isSeen = tf.allseen || sf[seenflag]', () => {
  it('returns false for unseen items', () => {
    expect(itemSeen(false, { bgm01b: true }, 'bgm02')).toBe(false);
  });

  it('returns true when the individual flag is set', () => {
    expect(itemSeen(false, { bgm01b: true }, 'bgm01b')).toBe(true);
  });

  it('returns true for EVERY key when the master switch is on', () => {
    expect(itemSeen(true, {}, 'anything')).toBe(true);
    expect(itemSeen(true, undefined, 'bgm99')).toBe(true);
  });

  it('treats undefined/falsey flags and missing maps as locked', () => {
    expect(itemSeen(false, undefined, 'x')).toBe(false);
    expect(itemSeen(undefined, { x: false }, 'x')).toBe(false);
  });
});

describe('anySeen', () => {
  it('unlocks on any of the aliases (event stem / _l master)', () => {
    expect(anySeen(false, { ev_a_l: true }, ['ev_a', 'ev_a_l'])).toBe(true);
    expect(anySeen(false, {}, ['ev_a', 'ev_a_l'])).toBe(false);
  });

  it('master switch overrides all flags', () => {
    expect(anySeen(true, {}, ['a', 'b'])).toBe(true);
  });
});
