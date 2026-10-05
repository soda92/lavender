import { describe, it, expect } from 'vitest';
import { sortScenes, isSceneUnlocked, type SceneEntry } from './scenes';

const mk = (heroine: string, storage: string, orig: string): SceneEntry => ({
  id: `${storage}_memory_begin`, heroine, thumb: `/thum/thumb2_${orig}.png`,
  orig, storage, startLabel: 'memory_begin', endLabel: 'memory_end',
});

describe('sortScenes', () => {
  it('groups by heroine (CG-tab order) and sorts story chronology per heroine', () => {
    // CSV ships 42 before 41 and the epilogue last.
    const sorted = sortScenes([
      mk('hikaru', 'lave.hikaru2', 'ev_hikaru_h_05aa'),
      mk('hikaru', 'lave42_hikaru', 'ev_hikaru_h_02aa'),
      mk('hikaru', 'lave41_hikaru', 'ev_hikaru_h_03a'),
      mk('akina', 'lave42_akina', 'ev_akina_h_03a'),
      mk('akina', 'lave.akina3', 'ev_akina_h_05a'),
      mk('akina', 'lave41_akina', 'ev_akina_h_04a'),
    ]);
    expect(sorted.map(s => s.storage)).toEqual([
      'lave41_akina', 'lave42_akina', 'lave.akina3',
      'lave41_hikaru', 'lave42_hikaru', 'lave.hikaru2',
    ]);
  });
});

describe('isSceneUnlocked', () => {
  it('checks the representative tag and its _l framing alias', () => {
    const s = mk('akina', 'lave41_akina', 'ev_akina_h_04a');
    expect(isSceneUnlocked({}, s)).toBe(false);
    expect(isSceneUnlocked({ ev_akina_h_04a: true }, s)).toBe(true);
    expect(isSceneUnlocked({ ev_akina_h_04a_l: true }, s)).toBe(true);
  });
});
