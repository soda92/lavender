import { describe, it, expect } from 'vitest';
import { resolveStand, type StandOption } from './standResolve';

/** Structural options mirroring はるか's charinit/info tables: only ポーズＡ
 *  declares すまし； Ｂ/Ｃ only have the 01-04/17+ plate sets. */
const haruka: StandOption[] = [
  {
    pose: 'ポーズＡ', base: 'haruka_a',
    dresses: [{ dress: '制服', diff: '基本' }],
    faces: [{ expression: '喜び' }, { expression: 'すまし' }],
  },
  {
    pose: 'ポーズＢ', base: 'haruka_b',
    dresses: [{ dress: '制服', diff: '基本' }],
    faces: [{ expression: '喜び' }],
    // すまし missing — the lave43/73 case (body has transparent face hole)
  },
  {
    pose: 'ポーズＣ', base: 'haruka_c',
    dresses: [{ dress: '制服', diff: '基本' }],
    faces: [{ expression: '喜び' }],
  },
];

describe('resolveStand face switching (exstand currentFaceNameMap)', () => {
  it('switches the WHOLE stand to the first pose declaring a missing face', () => {
    const r = resolveStand(haruka, { pose: 'ポーズＢ', dress: '制服', diff: '基本', face: 'すまし' });
    expect(r.index).toBe(0); // ポーズＡ — body AND face, not a borrowed plate
    expect(r.face).toBe('すまし');
    expect(r.switched).toBe(true);
  });

  it('stays in the requested pose when the face is declared there', () => {
    const r = resolveStand(haruka, { pose: 'ポーズＢ', dress: '制服', face: '喜び' });
    expect(r.index).toBe(1);
    expect(r.switched).toBe(false);
  });

  it('picks the FIRST pose in enumeration order even when later ones match', () => {
    const opts: StandOption[] = [
      { pose: 'a', base: 'a', dresses: [{ dress: 'X' }], faces: [{ expression: 'F' }] },
      { pose: 'b', base: 'b', dresses: [{ dress: 'X' }], faces: [] },
      { pose: 'c', base: 'c', dresses: [{ dress: 'X' }], faces: [{ expression: 'F' }] },
    ];
    expect(resolveStand(opts, { pose: 'b', dress: 'X', face: 'F' }).index).toBe(0);
  });

  it('only considers poses that carry the current dress', () => {
    const opts: StandOption[] = [
      { pose: 'a', base: 'a', dresses: [], faces: [{ expression: 'F' }] },
      { pose: 'b', base: 'b', dresses: [{ dress: 'X' }], faces: [] },
      { pose: 'c', base: 'c', dresses: [{ dress: 'X' }], faces: [{ expression: 'F' }] },
    ];
    expect(resolveStand(opts, { pose: 'b', dress: 'X', face: 'F' }).index).toBe(2);
  });

  it('checkDiffFace: unknown face defaults to the resolved stand first declared face', () => {
    const r = resolveStand(haruka, { pose: 'ポーズＢ', dress: '制服', face: '存在しない' });
    expect(r.index).toBe(1); // no pose has it -> pose untouched
    expect(r.face).toBe('喜び'); // faceList[0]
  });

  it('omitted face also defaults to the first declared face (face hole must be filled)', () => {
    const r = resolveStand(haruka, { pose: 'ポーズＢ', dress: '制服' });
    expect(r.face).toBe('喜び');
  });
});

describe('resolveStand diff switching (currentDiffNameMap)', () => {
  const hikaru: StandOption[] = [
    // ポーズＡ declares 腕組み/顎/腰 diffs per dress; Ｂ only 基本
    {
      pose: 'ポーズＡ', base: 'hikaru_a',
      dresses: [{ dress: '制服', diff: '基本' }, { dress: '制服', diff: '腰' }],
      faces: [{ expression: 'すましＡ' }],
    },
    {
      pose: 'ポーズＢ', base: 'hikaru_b',
      dresses: [{ dress: '制服', diff: '基本' }],
      faces: [{ expression: 'すまし' }],
    },
  ];

  it('switches pose when the diff is missing', () => {
    const r = resolveStand(hikaru, { pose: 'ポーズＢ', dress: '制服', diff: '腰' });
    expect(r.index).toBe(0);
    expect(r.switched).toBe(true);
  });

  it('does not switch for a diff the pose declares', () => {
    const r = resolveStand(hikaru, { pose: 'ポーズＡ', dress: '制服', diff: '腰', face: 'すましＡ' });
    expect(r.index).toBe(0);
    expect(r.switched).toBe(false);
  });

  it('unknown pose name starts from the first enumerated pose', () => {
    expect(resolveStand(haruka, { pose: 'ポーズＺ', dress: '制服' }).index).toBe(0);
  });
});
