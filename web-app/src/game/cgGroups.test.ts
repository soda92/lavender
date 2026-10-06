import { describe, it, expect } from 'vitest';
import {
  buildCgGroups, buildFallbackSections, cgGroupKey, naturalCompare,
  categoryOf, normalizeSections,
} from './cgGroups';

describe('cgGroupKey', () => {
  it('strips trailing letter runs and the _l framing', () => {
    expect(cgGroupKey('ev_akina_02c_l')).toBe('ev_akina_02');
    expect(cgGroupKey('ev_hikaru_03aa')).toBe('ev_hikaru_03');
    expect(cgGroupKey('ev_akina_03')).toBe('ev_akina_03');
    expect(cgGroupKey('ev_akina_03_l')).toBe('ev_akina_03');
  });
  it('leaves non-numeric extras untouched', () => {
    expect(cgGroupKey('ev_stex_hikaru_a')).toBe('ev_stex_hikaru_a');
  });
});

describe('naturalCompare', () => {
  it('orders numerically rather than lexicographically', () => {
    expect(['ev_2', 'ev_10', 'ev_1'].sort(naturalCompare)).toEqual(['ev_1', 'ev_2', 'ev_10']);
  });
});

describe('categoryOf', () => {
  it('maps heroine prefixes including h/c/stex variants', () => {
    expect(categoryOf('ev_akina_h_01a')).toBe('akina');
    expect(categoryOf('ev_c_stex_riko')).toBe('riko');
    expect(categoryOf('ev_other_02b')).toBe('other');
    expect(categoryOf('ev_akina_eyecatch')).toBe('akina');
  });
});

describe('buildCgGroups', () => {
  it('folds letter variants under one ordered group and drops _l frames', () => {
    const groups = buildCgGroups([
      '/evimage/ev_akina_01b_l.png',
      '/evimage/ev_akina_01a.png',
      '/evimage/ev_akina_01a_l.png',
      '/evimage/ev_akina_01b.png',
      '/evimage/ev_akina_03_l.png',
      '/evimage/ev_akina_03.png',
      '/evimage/ev_haruka_01.png',
    ]);
    expect(groups.map(g => g.id)).toEqual(['ev_akina_01', 'ev_akina_03', 'ev_haruka_01']);
    expect(groups[0].variants.map(v => v.stem)).toEqual(['ev_akina_01a', 'ev_akina_01b']);
    expect(groups[1].variants.map(v => v.stem)).toEqual(['ev_akina_03']);
  });

  it('groups the two-letter 03aa/ab/ba/bb variants as one CG', () => {
    const [g] = buildCgGroups([
      'ev_hikaru_03aa.png', 'ev_hikaru_03ab.png',
      'ev_hikaru_03ba.png', 'ev_hikaru_03bb.png',
      'ev_hikaru_03aa_l.png',
    ]);
    expect(g.id).toBe('ev_hikaru_03');
    expect(g.variants.map(v => v.stem)).toEqual([
      'ev_hikaru_03aa', 'ev_hikaru_03ab', 'ev_hikaru_03ba', 'ev_hikaru_03bb',
    ]);
  });
});

describe('normalizeSections', () => {
  it('derives variant URLs and preserves stex overlays', () => {
    const [s] = normalizeSections([{
      id: 'hikaru',
      tiles: [{
        id: 'thumb_stex_hikaru_a',
        thumb: '/thum/thumb_stex_hikaru_a.png',
        variants: [
          { stem: 'ev_stex_hikaru_a', overlay: 'st_ex_hikaru_a' },
          { stem: 'ev_hikaru_01' },
        ],
      }],
    }]);
    expect(s.tiles[0].variants[0].url).toBe('/evimage/ev_stex_hikaru_a.png');
    expect(s.tiles[0].variants[0].overlay).toContain('st_ex_hikaru_a');
    expect(s.tiles[0].variants[1].overlay).toBeUndefined();
  });
});

describe('buildFallbackSections', () => {
  it('buckets tiles in shipped section order and drops empties', () => {
    const sections = buildFallbackSections([
      '/evimage/ev_hikaru_01a.png', '/evimage/ev_akina_02.png',
    ]);
    expect(sections.map(s => s.id)).toEqual(['hikaru', 'akina']);
    expect(sections[0].tiles[0].thumb).toBe('/evimage/ev_hikaru_01a.png');
  });
});
