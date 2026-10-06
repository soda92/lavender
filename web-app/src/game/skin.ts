/**
 * Original engine UI skin.
 *
 * The shipped Akabeisoft2 UI lives in extracted_data/uipsd as component
 * PNGs; the accompanying *.csv files give exact stage coordinates
 * (800x600 stage, top-left origin). We serve the bitmaps verbatim and
 * place them per those CSVs instead of approximating in CSS.
 */

const uipsd = (name: string) => `/uipsd/${encodeURIComponent(name)}`;

export const SKIN = {
  // message01.csv: base (0,399 800x201), frame (7,445), name (0,418)
  mesBase: uipsd('message01@ベース%base.png'),
  mesFrame: uipsd('message01@フレーム%layer.png'),
  mesName: uipsd('message01@名前%layer.png'),
  // message01.csv: face mask layer at (0,400 205x200); its alpha channel is
  // the soft-edge mask applied to the 顔領域 crop.
  mesFaceMask: uipsd('message01@顔mask%layer.png'),
  // message00.csv: system button strip (0,580 800x20)
  sysBar: uipsd('message00@base%base.png'),
  // select.csv: choice rows (32,184 736x45)
  choiceOff: uipsd('select@select%button;off.png'),
  choiceOver: uipsd('select@select%button;over.png'),
  // title.csv
  titleBg: uipsd('title@背景%base.png'),
  titleLogo: uipsd('title@ロゴ%layer.png'),
  titleFrame: uipsd('title@0cref%cref;normal.png'),
  titleFrameOver: uipsd('title@0cref%cref;over.png'),
  // image/ClickGlyph.png + .asd: 12 clips of 25x17, loop ~0.79s
  clickGlyph: '/image/ClickGlyph.png',
} as const;

/** message02 = "simple window" skin (shown during event-CG scenes). */
export const SKIN2 = {
  mesBase: uipsd('message02@ベース%base.png'),
  mesName: uipsd('message02@名前%layer.png'),
  mesFaceMask: uipsd('message02@顔mask%layer.png'),
} as const;

/**
 * Design cursor art. PNG renders of the engine's cur_normal/cur_over
 * emitted by the extractor with the hotspot moved to the center of the
 * sprig (16,16). PNG is used rather than .cur because browsers honor the
 * explicit CSS hotspot coordinates reliably across platforms.
 */
export const CURSOR_DESIGN = '/image/cur_normal.png';
/** Hover cursor for clickable UI (choices, buttons). */
export const CURSOR_OVER = '/image/cur_over.png';
export const CURSOR_HOTSPOT = '16 16';

// ---------------------------------------------------------------------------
// dialog.csv: engine Yes/No confirmation popup (309x154 at 245,223)
// ---------------------------------------------------------------------------

export const DIALOG_SKIN = {
  base: uipsd('dialog@ベース%base.png'),
  yesOff: uipsd('dialog@はい%button;off.png'),
  yesOver: uipsd('dialog@はい%button;over.png'),
  noOff: uipsd('dialog@いいえ%button;off.png'),
  noOver: uipsd('dialog@いいえ%button;over.png'),
} as const;

export const DIALOG_LABELS: Record<string, string> = {
  上書き: uipsd('dialog@上書き%layer.png'),
  ロード: uipsd('dialog@ロード%layer.png'),
  クイックセーブ: uipsd('dialog@クイックセーブ%layer.png'),
  クイックロード: uipsd('dialog@クイックロード%layer.png'),
  タイトル: uipsd('dialog@タイトル%layer.png'),
  初期化: uipsd('dialog@初期化%layer.png'),
};

// ---------------------------------------------------------------------------
// config_{system,sound,shortcut}.csv — full-stage settings overlay.
// Layouts below are stage px (800x600), transcribed from the shipped CSVs.
// ---------------------------------------------------------------------------

export type CfgPage = 0 | 1 | 2;
export const CFG_PAGES = ['config_system', 'config_sound', 'config_shortcut'] as const;

const cfgAsset = (page: string, tail: string) =>
  uipsd(`${page}@${tail}.png`);

export const cfgUrl = (page: typeof CFG_PAGES[number] | string, tail: string) =>
  cfgAsset(page, tail);

/** Per-page chrome shared by all three config storages. */
export const CFG_CHROME = {
  sheet: { 0: { x: 322, y: 35, w: 451, h: 376 },
           1: { x: 322, y: 33, w: 451, h: 434 },
           2: { x: 320, y: 24, w: 463, h: 482 } },
  // alltabs cref: one 114x87 artwork showing all three tab labels.
  tabs: { x: 32, y: 56, w: 114, h: 87 },
  // invisible per-tab hit rects over the cref art
  tabHits: [{ x: 32, y: 53, w: 127, h: 24 },
            { x: 32, y: 89, w: 127, h: 24 },
            { x: 32, y: 125, w: 127, h: 24 }],
  reset: { x: 231, y: 450, w: 66, h: 65 },
  back: { x: 231, y: 522, w: 66, h: 65 },
} as const;

/** system/text page interactive geometry. */
export const CFG_SYSTEM = {
  // radio group art: 227x254 at 514,55; four pill rows inside
  switchGroup: { x: 514, y: 55, w: 227, h: 254 },
  // local rects (relative to group) of each pill, per CSV button rows
  pills: [
    { x: 0, y: 0, w: 110, h: 18 },   // ウィンドウ  (514,55)
    { x: 115, y: 0, w: 112, h: 18 }, // フルスクリーン (629,55)
    { x: 0, y: 32, w: 110, h: 18 },  // デザイン (514,87)
    { x: 115, y: 32, w: 112, h: 18 },// システム (629,87)
    { x: 0, y: 94, w: 110, h: 18 },  // 曲名表示あり (514,149)
    { x: 115, y: 94, w: 112, h: 18 },// 曲名表示なし (629,149)
    { x: 0, y: 236, w: 110, h: 18 }, // 既読スキップ (514,291)
    { x: 115, y: 236, w: 112, h: 18},// 全文スキップ (629,291)
  ],
  // ask cref: 226x218 at 514,184 — four confirm rows + window-style row.
  askGroup: { x: 514, y: 184, w: 226, h: 218 },
  // checkbox glyph crops (16x16) out of ask;on/ask;over;on art.
  // CSV hit rects → local coordinates.
  checks: [
    { x: 513, y: 182, w: 111, h: 18, key: 'confirmSave' },
    { x: 629, y: 182, w: 111, h: 18, key: 'confirmLoad' },
    { x: 513, y: 203, w: 111, h: 18, key: 'confirmQSave' },
    { x: 629, y: 203, w: 111, h: 18, key: 'confirmQLoad' },
    { x: 513, y: 386, w: 232, h: 18, key: 'simpleEventWindow' },
  ],
  // sliders: baked track rect (track) + knob home (CSV nsld: 621,123)
  knobs: { w: 31, h: 8 },
  sliders: [
    { key: 'drawPos', x: 515, y: 123, w: 225, def: 120 },
    { key: 'textPos', x: 515, y: 266, w: 225, def: 32 },
    { key: 'autoPos', x: 515, y: 327, w: 225, def: 110 },
    { key: 'windowOpac', x: 515, y: 360, w: 225, def: 255 },
  ],
} as const;

/** sound page interactive geometry. */
export const CFG_SOUND = {
  knobs: { w: 31, h: 8 },
  sliders: [
    { key: 'masterVol', x: 515, y: 59, w: 225, def: 80, max: 100 },
    { key: 'bgmVol', x: 515, y: 81, w: 225, def: 80, max: 100 },
    { key: 'seVol', x: 515, y: 103, w: 225, def: 80, max: 100 },
    { key: 'voiceVol', x: 515, y: 125, w: 225, def: 80, max: 100 },
  ],
  // complete toggle artwork (label + checkbox baked)
  wideToggles: [
    { key: 'voiceCut', asset: 'ボイス非停止', x: 513, y: 149, w: 216, h: 18, img: { w: 207, h: 14, ox: 1, oy: 2 } },
    { key: 'bgmDown', asset: 'ボイスbgm下げ', x: 513, y: 170, w: 216, h: 18, img: { w: 194, h: 14, ox: 1, oy: 2 } },
  ],
  // 16 character voice cells (custom.tjs order); face strip ;1..;16.
  chars: ['hik', 'har', 'aki', 'rik', 'rei', 'kur', 'set', 'itu',
          'kou', 'uko', 'sas', 'miz', 'dai', 'mit', 'wom', 'man'],
  faceW: 139, faceH: 43,
  cellOrigins: [
    [325, 198], [474, 198], [625, 198],
    [325, 243], [474, 243], [625, 243],
    [325, 288], [474, 288], [625, 288],
    [325, 333], [474, 333], [625, 333],
    [325, 378], [474, 378],
    [325, 423], [474, 423],
  ],
  // voice toggle over the portrait, and vsld knob over the baked track
  toggleSize: 41,
  smallKnob: { w: 20, h: 6, dx: 47, dy: 27, trackW: 90 },
} as const;

/** Engine default config sf keys (used by 初期化). */
export const CFG_DEFAULTS: Record<string, any> = {
  screenMode: 'window',
  designCursor: true,
  drawPos: 120,
  showBGMTitle: true,
  confirmSave: true,
  confirmLoad: true,
  confirmQSave: true,
  confirmQLoad: true,
  textPos: 32,
  skipMode: 'ALL',
  autoPos: 110,
  simpleEventWindow: false,
  masterVol: 80,
  bgmVol: 80,
  seVol: 80,
  voiceVol: 80,
  voiceCut: true,
  bgmDown: false,
  voiceMute: {},
  voiceGain: {},
};

/** Coordinates below are absolute in the 800x600 stage. */
export const MES_LAYOUT = {
  base: { x: 0, y: 399, w: 800, h: 201 },
  frame: { x: 7, y: 445, w: 785, h: 131 },
  namePlate: { x: 0, y: 418, w: 353, h: 31 },
  // Text rects come from the base sub-regions in message01.csv.
  nameText: { x: 159, y: 422, w: 183, h: 24 },
  bodyText: { x: 159, y: 459, w: 626, h: 105 },
  waitIcon: { x: 758, y: 547, w: 27, h: 21 },
} as const;

// ---------------------------------------------------------------------------
// cgmemory.csv — CG / scene recollection album (800x600 stage).
// ---------------------------------------------------------------------------

const cgMem = (tail: string) => uipsd(`cgmemory@${tail}.png`);

export const CG_MEMORY = {
  base: cgMem('背景%base'),
  titleScene: cgMem('シーン鑑賞%layer'),
  titleCg: cgMem('画像鑑賞%layer'),
  // mode-switch tiles (cream "» ... mode" strips), 141x23
  toScene: { off: cgMem('シーン鑑賞へ%button;off'), over: cgMem('シーン鑑賞へ%button;over') },
  toCg: { off: cgMem('画像鑑賞へ%button;off'), over: cgMem('画像鑑賞へ%button;over') },
  toSound: { off: cgMem('音楽鑑賞へ%button;off'), over: cgMem('音楽鑑賞へ%button;over') },
  // charcoal Back tile, 52x52
  back: { off: cgMem('戻る%button;off'), over: cgMem('戻る%button;over') },
  // face-tab rail: 6 rows of 207x58 at x18, y121 pitch 58
  rail: {
    normal: cgMem('chrtabs%cref;normal'),
    on: cgMem('chrtabs%cref;on'),
    over: cgMem('chrtabs%cref;over'),
    frame: { x: 21, y: 124, w: 201, h: 342 },
    rows: [0, 1, 2, 3, 4, 5].map(i => ({ x: 18, y: 121 + i * 58, w: 207, h: 58, cropY: i * 57 })),
  },
  // CG grid: 4x4 cards, 130x100 at (243,116) pitch 135/105
  cg: {
    frameOff: cgMem('データ%button;off'),
    frameOver: cgMem('データ%button;over'),
    locked: cgMem('データ%button;サムネ'),
    perPage: 16,
    origins: [0, 1, 2, 3].flatMap(row =>
      [0, 1, 2, 3].map(col => ({ x: 243 + col * 135, y: 116 + row * 105, w: 130, h: 100 }))),
    thumb: { x: 5, y: 4, w: 120, h: 90 },
  },
  // Scene grid: 2x2 cards, 250x190 at (250,123)/(521,123)/(250,334)/(521,334)
  scene: {
    frameOff: cgMem('mデータ%button;off'),
    frameOver: cgMem('mデータ%button;over'),
    locked: cgMem('mデータ%button;サムネ'),
    perPage: 4,
    origins: [
      { x: 250, y: 123 }, { x: 521, y: 123 },
      { x: 250, y: 334 }, { x: 521, y: 334 },
    ],
    thumb: { x: 5, y: 4, w: 240, h: 180 },
  },
  // title layers
  titleRects: { scene: { x: 40, y: 32, w: 265, h: 60 }, cg: { x: 38, y: 31, w: 185, h: 61 } },
  // mode tiles + back geometry
  modeBtn: { x: [423, 573], y: 58, w: 141, h: 23 },
  backRect: { x: 723, y: 30, w: 52, h: 52 },
  // numeric pager row, 4 slots of 31x35 at (246,545) pitch 40
  pager: { x: 246, y: 545, w: 31, h: 35, pitch: 40, groupSize: 4 },
} as const;

// ---------------------------------------------------------------------------
// sound.csv — music room (same paper-album family, 800x600 stage).
// ---------------------------------------------------------------------------

const snd = (tail: string) => uipsd(`sound@${tail}.png`);

export const SOUND_SKIN = {
  base: snd('背景%base'),
  title: snd('音楽鑑賞%layer'),
  titleRect: { x: 37, y: 31, w: 229, h: 61 },
  toScene: { off: snd('シーン鑑賞へ%button;off'), over: snd('シーン鑑賞へ%button;over') },
  toCg: { off: snd('画像鑑賞へ%button;off'), over: snd('画像鑑賞へ%button;over') },
  back: { off: snd('戻る%button;off'), over: snd('戻る%button;over') },
  // numbered list sheets: layer;1 = 01..20, layer;2 = 21..40 (35 tracks)
  sheet: { x: 33, y: 141, w: 393, h: 369, layers: [
    snd('page%layer;1'), snd('page%layer;2'), snd('page%layer;3'),
  ] },
  // 20 rows per page: two columns of 10, 366x35 at (27,128)/(406,128)
  row: { w: 366, h: 35, cols: [27, 406], y0: 128, pitch: 40, perCol: 10 },
  rowOff: snd('データ%button;off'),
  rowOver: snd('データ%button;over'),
  rowOn: snd('データ%button;on'),
  perPage: 20,
  // pager slots at x36/76/116 (35 tracks -> 2 pages)
  pager: { x: 46, y: 545, w: 31, h: 35, pitch: 40, slotOffset: -10, groupSize: 3 },
} as const;

export const SYS_BAR_Y = 580;

export const SYS_BUTTONS = [
  // message00.csv geometry; labels taken from message00.func.
  { id: 'qsave', x: 25, w: 67, kind: 'text', label: 'Q.save' },
  { id: 'qload', x: 92, w: 67, kind: 'text', label: 'Q.load' },
  { id: 'save', x: 159, w: 67, kind: 'text', label: 'Save' },
  { id: 'load', x: 226, w: 67, kind: 'text', label: 'Load' },
  { id: 'config', x: 293, w: 67, kind: 'text', label: 'Config' },
  { id: 'title', x: 360, w: 67, kind: 'text', label: 'Title' },
  { id: 'exit', x: 427, w: 67, kind: 'text', label: 'Exit' },
  { id: 'auto', x: 494, w: 56, kind: 'glyph', glyph: '▶' },
  { id: 'skip', x: 550, w: 56, kind: 'glyph', glyph: '▶▶' },
  { id: 'log', x: 606, w: 56, kind: 'glyph', glyph: '◀' },
  { id: 'voice', x: 662, w: 56, kind: 'voice' },
  { id: 'hide', x: 718, w: 56, kind: 'glyph', glyph: '✕' },
] as const;
