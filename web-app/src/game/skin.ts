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
