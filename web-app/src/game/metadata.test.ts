import { describe, it, expect, beforeAll } from 'vitest';
import {
  classifyToken,
  renderCharacter,
  findLabelIndex,
  stageStem,
  resolveCharDisp,
  allcharHideDisp,
  charBodyVisible,
  originModeToAfAf,
  originTranslate,
  originModeToViewPx,
  originParamPx,
  layerScreenPlacement,
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
  it('無 (INVISIBLE) and 消 (CLEAR) hide with distinct kinds', () => {
    expect(classifyToken('アキナ', '無')).toBe('hideInvisible');
    expect(classifyToken('はるか', '消')).toBe('hideClear');
  });
  it('出/立 (BOTH/BU) show the body, 顔 (FACE) is face-window only', () => {
    expect(classifyToken('アキナ', '出')).toBe('show');
    expect(classifyToken('アキナ', '立')).toBe('show');
    expect(classifyToken('大九郎', '顔')).toBe('faceDisp');
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
  it('level 1 trimmed page and placement offsets (akina pose C)', () => {
    const r = renderCharacter('アキナ', {
      pose: 'ポーズＣ', dress: '制服', diff: '基本', face: 'テレ１', level: 1,
    })!;
    // Page is the union bounds of every manifest layer (full canvas here).
    expect(r.page).toEqual({ x: 0, y: 0, w: 277, h: 968 });
    // Drawn at native 1:1 pixels, bottom-center anchored at (400, 1000):
    // top = 300 + 700 + 33 - 968 = 65, left = 400 + 16 - 277/2.
    expect(r.offsetX).toBe(16);
    expect(r.offsetY).toBe(33); // charlevel y=-33 is up-positive
    expect(r.body?.url).toContain('akina_c_1_');
    expect(r.face).not.toBeNull();
  });

  it('level 2 (手前) is the native 2x sheet framed near the top as a close-up', () => {
    const r = renderCharacter('アキナ', {
      pose: 'ポーズＣ', dress: '制服', diff: '基本', face: 'テレ１', level: 2,
    })!;
    expect(r.page).toEqual({ x: 0, y: 0, w: 554, h: 1937 });
    // top = 300 + 700 + 951 - 1937 = 14: hair crown near the screen top.
    expect(r.offsetX).toBe(22);
    expect(r.offsetY).toBe(951);
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

describe('resolveCharDisp — KAGEnvImage disposition state machine', () => {
  it('explicit tokens override any current state', () => {
    for (const d of ['both', 'face', 'clear', 'invisible'] as const) {
      expect(resolveCharDisp(d, 'both', true)).toBe('both');
      expect(resolveCharDisp(d, 'face', true)).toBe('face');
      expect(resolveCharDisp(d, 'clear', true)).toBe('clear');
      expect(resolveCharDisp(d, 'invisible', true)).toBe('invisible');
    }
  });

  it('CLEAR + a touching tag auto-re-shows as BOTH', () => {
    expect(resolveCharDisp('clear', null, true)).toBe('both');
  });

  it('INVISIBLE stays suppressed even when a pose tag touches', () => {
    expect(resolveCharDisp('invisible', null, true)).toBe('invisible');
  });

  it('FACE is preserved by bare pose tags (bust stays, no body)', () => {
    expect(resolveCharDisp('face', null, true)).toBe('face');
    expect(resolveCharDisp('both', null, true)).toBe('both');
    expect(resolveCharDisp('bu', null, true)).toBe('bu');
  });

  it('untouched tags never change disposition', () => {
    for (const d of ['both', 'bu', 'face', 'clear', 'invisible'] as const) {
      expect(resolveCharDisp(d, null, false)).toBe(d);
    }
  });

  it('reproduces the lave34 FACE exchange after allchar hide', () => {
    // allchar hide clears body chars but must leave FACE busts alone.
    expect(allcharHideDisp('both')).toBe('clear');
    expect(allcharHideDisp('bu')).toBe('clear');
    expect(allcharHideDisp('face')).toBeNull();
    expect(allcharHideDisp('clear')).toBeNull();
    expect(allcharHideDisp('invisible')).toBeNull();
    // Six chars addressed by 顔 after the hide stay FACE through their bare
    // pose/face-update tags; no bodies come back until an explicit 出.
    let disp: any = 'clear';
    disp = resolveCharDisp(disp, 'face', true);   // 顔
    for (let i = 0; i < 5; i++) disp = resolveCharDisp(disp, null, true);
    expect(disp).toBe('face');
    expect(charBodyVisible(disp)).toBe(false);
    disp = resolveCharDisp(disp, 'both', true);   // 出 after the scene
    expect(charBodyVisible(disp)).toBe(true);
  });
});

describe('originModeToAfAf — KAGEnvImage origin 1–9', () => {
  it('maps the clockwise 1–9 enum', () => {
    expect(originModeToAfAf(1)).toEqual({ afx: 'left', afy: 'top' });
    expect(originModeToAfAf(2)).toEqual({ afx: 'center', afy: 'top' });
    expect(originModeToAfAf(3)).toEqual({ afx: 'right', afy: 'top' });
    expect(originModeToAfAf(4)).toEqual({ afx: 'right', afy: 'center' });
    expect(originModeToAfAf(5)).toEqual({ afx: 'right', afy: 'bottom' });
    expect(originModeToAfAf(6)).toEqual({ afx: 'center', afy: 'bottom' });
    expect(originModeToAfAf(7)).toEqual({ afx: 'left', afy: 'bottom' });
    expect(originModeToAfAf(8)).toEqual({ afx: 'left', afy: 'center' });
    expect(originModeToAfAf(9)).toEqual({ afx: 'center', afy: 'center' });
  });

  it('falls back to engine defaults (center/center) for 0/garbage', () => {
    // ev_other_13 ships origin=0; omitted origin must behave identically.
    for (const v of [0, undefined, null, '', 'foo', 10]) {
      expect(originModeToAfAf(v as any)).toEqual({ afx: 'center', afy: 'center' });
    }
  });

  it('accepts numeric strings (tag args arrive as strings)', () => {
    expect(originModeToAfAf('1')).toEqual({ afx: 'left', afy: 'top' });
  });
});

describe('originTranslate — layer registration transform', () => {
  it('center-registers with -50% (event _l pan masters)', () => {
    expect(originTranslate('center', 'center')).toBe('translate(-50%, -50%) translate(0px, 0px)');
  });

  it('top-left registration has no percent offset (keiko miniscenes, origin=1)', () => {
    expect(originTranslate('left', 'top')).toBe('translate(0%, 0%) translate(0px, 0px)');
  });

  it('bottom-right registration shifts by -100%', () => {
    expect(originTranslate('right', 'bottom')).toBe('translate(-100%, -100%) translate(0px, 0px)');
  });

  it('adds the pan-start delta in px (WAAPI first keyframe)', () => {
    // keiko1 glides xpos -523 -> 0: the first frame is offset by from-to.
    expect(originTranslate('left', 'top', -523, 0)).toBe('translate(0%, 0%) translate(-523px, 0px)');
    expect(originTranslate('center', 'center', 10, -20)).toBe('translate(-50%, -50%) translate(10px, -20px)');
  });
});

describe('originModeToViewPx — vorigin view origin in stage px', () => {
  it('maps the enum onto stage coordinates', () => {
    expect(originModeToViewPx(1)).toEqual({ orx: 0, ory: 0 });        // left/top
    expect(originModeToViewPx(2)).toEqual({ orx: 400, ory: 0 });      // center/top (neko)
    expect(originModeToViewPx(3)).toEqual({ orx: 800, ory: 0 });      // right/top
    expect(originModeToViewPx(5)).toEqual({ orx: 800, ory: 600 });
    expect(originModeToViewPx(9)).toEqual({ orx: 400, ory: 300 });
  });

  it('0/omitted is the mid-stage default', () => {
    expect(originModeToViewPx(0)).toEqual({ orx: 400, ory: 300 });
    expect(originModeToViewPx(undefined)).toEqual({ orx: 400, ory: 300 });
  });
});

describe('originParamPx — orx/ory tag values', () => {
  it('maps alignment words', () => {
    expect(originParamPx('center', 'x')).toBe(400);
    expect(originParamPx('left', 'x')).toBe(0);
    expect(originParamPx('right', 'x')).toBe(800);
    expect(originParamPx('top', 'y')).toBe(0);
    expect(originParamPx('bottom', 'y')).toBe(600);
  });
  it('passes numeric values through (quiz layer ory=220)', () => {
    expect(originParamPx('220', 'y')).toBe(220);
    expect(originParamPx('-600', 'y')).toBe(-600);
  });
});

describe('layerScreenPlacement — engine layer placement', () => {
  it('lave34 sky scroll: 1100x900 at xpos=0 fully covers the 800x600 stage', () => {
    // Regression: layers were rendered with xpos as the absolute image
    // center, so the macro scroll layer (default mid-stage view origin)
    // landed at x=-550 and left the right 250px showing the dojo ("half
    // sky"). Engine: screenX = orx(400) + xpos(0) - w/2(550) = -150.
    const start = layerScreenPlacement(
      { xpos: 0, ypos: -150, afx: 'center', afy: 'center' }, 1100, 900);
    expect(start).toEqual({ x: -150, y: -300 });
    const end = layerScreenPlacement(
      { xpos: 0, ypos: 150, afx: 'center', afy: 'center' }, 1100, 900);
    expect(end).toEqual({ x: -150, y: 0 });
    // Both endpoints cover the whole stage horizontally.
    expect(end.x).toBeLessThanOrEqual(0);
    expect(end.x + 1100).toBeGreaterThanOrEqual(800);
  });

  it('keiko miniscenes (vorigin=1 -> orx/ory=0, origin=1 -> afx/afy top-left)', () => {
    const l = { orx: 0, ory: 0, afx: 'left' as const, afy: 'top' as const };
    expect(layerScreenPlacement({ ...l, xpos: 0, ypos: 0 }, 523, 371)).toEqual({ x: 0, y: 0 });
    expect(layerScreenPlacement({ ...l, xpos: 353, ypos: 0 }, 447, 371)).toEqual({ x: 353, y: 0 });
    expect(layerScreenPlacement({ ...l, xpos: 63, ypos: 153 }, 523, 371)).toEqual({ x: 63, y: 153 });
  });

  it('riko _l pan master (1600x1200): offsets measured from mid-stage', () => {
    // start [-200,-400] -> [-600,-700]; end [400,300] -> top-left quadrant.
    const a = layerScreenPlacement({ xpos: -200, ypos: -400 }, 1600, 1200);
    expect(a).toEqual({ x: -600, y: -700 });
    const b = layerScreenPlacement({ xpos: 400, ypos: 300 }, 1600, 1200);
    expect(b).toEqual({ x: 0, y: 0 });
  });

  it('neko overlay (vorigin=2 center/top, center afx) stays horizontally centered', () => {
    // origin=2 => afx center / afy top; vorigin=2 => orx 400 / ory 0.
    const l = { orx: 400, ory: 0, afx: 'center' as const, afy: 'top' as const };
    const p = layerScreenPlacement({ ...l, xpos: 0, ypos: 600 }, 400, 300);
    expect(p).toEqual({ x: 200, y: 600 });
  });

  it('quiz layer numeric ory=220 with ypos=-600', () => {
    const p = layerScreenPlacement(
      { orx: 400, ory: 220, xpos: null, ypos: -600 }, 500, 400);
    expect(p).toEqual({ x: 150, y: 220 - 600 - 200 });
  });

  it('plain 800x600 event CG with no coordinates fills the frame', () => {
    expect(layerScreenPlacement({}, 800, 600)).toEqual({ x: 0, y: 0 });
  });
});
