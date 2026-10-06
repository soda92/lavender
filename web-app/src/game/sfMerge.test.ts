import { describe, it, expect } from 'vitest';
import { mergeSfHydration } from './sfMerge';

describe('mergeSfHydration (defaults < localStorage < server)', () => {
  it('keeps defaults untouched when neither layer has a key', () => {
    const out = mergeSfHydration({ vol: 8, bgmSeen: {} }, {}, {});
    expect(out.vol).toBe(8);
  });

  it('fills server-missing scalars from the local copy', () => {
    // the allSeen-on-409-POST regression: local has it, server never got it
    const out = mergeSfHydration({ allSeen: false }, { allSeen: true }, {});
    expect(out.allSeen).toBe(true);
  });

  it('server scalars win over local values', () => {
    const out = mergeSfHydration({}, { vol: 2 }, { vol: 9 });
    expect(out.vol).toBe(9);
  });

  it('unions one-level progress maps (bgmSeen/cgSeen), server wins per leaf', () => {
    const out = mergeSfHydration(
      { bgmSeen: {} },
      { bgmSeen: { bgm01b: true, bgm02: true } },
      { bgmSeen: { bgm02: false } },
    );
    expect(out.bgmSeen).toEqual({ bgm01b: true, bgm02: false });
  });

  it('unions readScenarios two levels deep', () => {
    const out = mergeSfHydration(
      { readScenarios: {} },
      { readScenarios: { lave01: { 10: true, 20: true } } },
      { readScenarios: { lave01: { 20: false }, lave02: { 5: true } } },
    );
    expect(out.readScenarios).toEqual({
      lave01: { 10: true, 20: false },
      lave02: { 5: true },
    });
  });

  it('tolerates junk layers and null values', () => {
    const out = mergeSfHydration({ vol: 8 }, null, undefined, { bgmVol: 70 }, { vol: null });
    expect(out.vol).toBe(8);
    expect(out.bgmVol).toBe(70);
  });

  it('does not mutate the defaults object', () => {
    const dflt = { bgmSeen: { a: true } };
    const out = mergeSfHydration(dflt, { bgmSeen: { b: true } }, {});
    expect(out.bgmSeen).toEqual({ a: true, b: true });
    expect(dflt.bgmSeen).toEqual({ a: true });
  });
});
