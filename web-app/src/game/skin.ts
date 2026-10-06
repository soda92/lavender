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

/** Original OS cursor art (design vs system cursor toggle). */
export const CURSOR_DESIGN = '/image/cur_normal.cur';

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
