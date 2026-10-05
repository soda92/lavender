import { describe, it, expect, beforeAll } from 'vitest';
import {
  classifyToken,
  renderCharacter,
  findLabelIndex,
  stageStem,
  __setManifestsForTest,
} from './metadata';
import envinit from '../../../extracted_data/envinit.json';
import charmeta from '../../../extracted_data/characters.json';

beforeAll(() => {
  // A file map that resolves every media stem (URLs are not fetched in tests).
  const fileMap = new Proxy({} as Record<string, string>, {
    get: (_t, prop) => (typeof prop === 'string' ? `/media/${prop}.png` : undefined),
    has: () => true,
  });
  __setManifestsForTest({
    fileMap,
    envinit: envinit as any,
    charmeta: charmeta as any,
  });
});

describe('classifyToken — disposition words (envinit DISPPOSITION)', () => {
  it('無 (INVISIBLE) and 消 (CLEAR) hide', () => {
    expect(classifyToken('アキナ', '無')).toBe('hide');
    expect(classifyToken('はるか', '消')).toBe('hide');
  });
  it('出 (BOTH), 立 (BU), 顔 (FACE) show', () => {
    expect(classifyToken('アキナ', '出')).toBe('show');
    expect(classifyToken('アキナ', '立')).toBe('show');
    expect(classifyToken('大九郎', '顔')).toBe('show');
  });
});

describe('classifyToken — art / position vocabulary', () => {
  it('classifies dress, diff, pose, face tokens', () => {
    expect(classifyToken('アキナ', '制服')).toBe('dress');
    expect(classifyToken('アキナ', '基本')).toBe('diff');
    expect(classifyToken('アキナ', 'ポーズＣ')).toBe('pose');
    expect(classifyToken('アキナ', 'テレ１')).toBe('face');
  });
  it('classifies x positions and levels', () => {
    expect(classifyToken('アキナ', '中')).toBe('xpos');
    expect(classifyToken('アキナ', '右外')).toBe('xpos');
    expect(classifyToken('アキナ', '手前')).toBe('level');
    expect(classifyToken('アキナ', '奥')).toBe('level');
  });
  it('never mistakes a hide word for a face expression', () => {
    expect(classifyToken('はるか', '無')).not.toBe('face');
  });
});

describe('renderCharacter — level sheets', () => {
  it('level 1 canvas and offsets (akina pose C)', () => {
    const r = renderCharacter('アキナ', {
      pose: 'ポーズＣ', dress: '制服', diff: '基本', face: 'テレ１', level: 1,
    })!;
    expect(r.canvas).toEqual([277, 968]);
    expect(r.refCanvasH).toBe(968);
    expect(r.scale).toBe(1);
    expect(r.offsetX).toBe(16);
    expect(r.offsetY).toBe(-33);
    expect(r.body?.url).toContain('akina_c_1_');
    expect(r.face).not.toBeNull();
  });

  it('level 2 (手前) is the 2x zoom stage: 2x sheet, same ref scale, close-up offset', () => {
    const r = renderCharacter('アキナ', {
      pose: 'ポーズＣ', dress: '制服', diff: '基本', face: 'テレ１', level: 2,
    })!;
    expect(r.canvas).toEqual([554, 1937]);
    // Every level draws at the level-1 pixel scale, so the 2x sheet reads
    // as a 2x foreground zoom rather than a shrunken full-body sheet.
    expect(r.refCanvasH).toBe(968);
    expect(r.scale).toBe(1);
    expect(r.offsetX).toBe(22);
    expect(r.offsetY).toBe(-951);
    expect(r.body?.url).toContain('akina_c_2_');
  });
});

describe('findLabelIndex', () => {
  const instructions = [
    { type: 'command', name: 'initscene' },
    { type: 'label', name: 'lave01' },
    { type: 'text', text_jp: 'a' },
    { type: 'label', name: 'branch' },
    { type: 'text', text_jp: 'b' },
  ];
  it('finds labels and returns -1 when missing (callers must guard)', () => {
    expect(findLabelIndex(instructions, 'lave01')).toBe(1);
    expect(findLabelIndex(instructions, 'branch')).toBe(3);
    expect(findLabelIndex(instructions, 'nope')).toBe(-1);
  });
});

describe('stageStem', () => {
  it('substitutes the time prefix into the stage image template', () => {
    const s = stageStem('空雨', '夜');
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });
});
