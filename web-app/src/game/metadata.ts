// Metadata bootstrap: loads the three compiled manifests produced by the Go
// extraction pipeline and provides resolution helpers for backgrounds,
// media, and the layered character sprite system.

export interface SpriteLayer {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
  layer_id: number;
  group_id: number;
}

export interface DressInfo {
  dress: string;
  kind: string;
  diff: string;
  layer: string; // manifest layer name, e.g. "seihuku/Base(seihuku)"
  folder: string;
}

export interface FaceInfo {
  expression: string;
  base_spec: string;
  layer: string; // face code, e.g. "01"
}

export interface PoseMeta {
  dresses: DressInfo[];
  faces: FaceInfo[];
  levels: Record<string, SpriteLayer[]>;
  canvas: Record<string, [number, number]>;
}

export interface CharPoseRef {
  pose: string;
  base: string;
  xoffset?: number;
  yoffset?: number;
}

export interface CharInfo {
  name: string;
  level_offsets?: Record<string, Array<{ x: number; y: number }>>;
  poses: CharPoseRef[];
}

export interface CharacterMeta {
  characters: Record<string, CharInfo>;
  poses: Record<string, PoseMeta>;
}

export interface StageDef {
  image: string;
  [key: string]: unknown;
}

export interface TimeDef {
  prefix: string;
  brightness?: number;
  contrast?: number;
  lightColor?: number;
  lightType?: { $const: string };
  charBrightness?: number;
  charContrast?: number;
  charLightColor?: number;
  charLightType?: { $const: string };
}

export interface PositionDef {
  xpos?: number;
  level?: number;
  disp?: { $const: string };
  type?: { $const: string };
}

export interface EnvInit {
  stages: Record<string, StageDef>;
  times: Record<string, TimeDef>;
  positions: Record<string, PositionDef>;
  transitions: Record<string, { method: string; time: number; [k: string]: unknown }>;
  actions: Record<string, Record<string, unknown>>;
  characters: Record<string, { voiceFlag?: boolean; voiceName?: string; nameAlias?: string }>;
  defaultTime: string;
  defaultLevel: number;
  yoffset?: number;
  [key: string]: unknown;
}

export interface ScenarioLabel {
  name: string;
  caption: string;
}

export interface ScenarioSummary {
  storage: string; // scenario/lave01
  name: string;
  labels: ScenarioLabel[];
}

interface Manifests {
  fileMap: Record<string, string>;
  lowerMap: Record<string, string>;
  envinit: EnvInit;
  charmeta: CharacterMeta;
  scenarios: ScenarioSummary[];
}

let cache: Manifests | null = null;
const waiters: Array<() => void> = [];

export async function loadMetadata(): Promise<Manifests> {
  if (cache) return cache;
  const [fm, env, ch, sc] = await Promise.all([
    fetch('/meta/file_map.json').then(r => r.json()),
    fetch('/meta/envinit.json').then(r => r.json()),
    fetch('/meta/characters.json').then(r => r.json()),
    fetch('/api/scenarios').then(r => r.json()),
  ]);
  const lowerMap: Record<string, string> = {};
  for (const k of Object.keys(fm)) lowerMap[k.toLowerCase()] = k;
  cache = { fileMap: fm, lowerMap, envinit: env, charmeta: ch, scenarios: sc };
  waiters.splice(0).forEach(w => w());
  return cache;
}

export function getMeta(): Manifests | null {
  return cache;
}

/** Test helper: install prebuilt manifests without going through fetch. */
export function __setManifestsForTest(m: {
  fileMap?: Record<string, string>;
  lowerMap?: Record<string, string>;
  envinit: EnvInit;
  charmeta: CharacterMeta;
  scenarios?: ScenarioSummary[];
}) {
  cache = {
    fileMap: m.fileMap || {},
    lowerMap: m.lowerMap || {},
    envinit: m.envinit,
    charmeta: m.charmeta,
    scenarios: m.scenarios || [],
  };
}

/** Resolve a bare media stem (e.g. "bgm04", "hik_0000") to its web path. */
export function mediaUrl(stem: string | undefined | null): string {
  if (!stem) return '';
  const m = cache;
  if (!m) return '';
  if (stem.startsWith('/') || stem.startsWith('http')) return stem;
  const direct = m.fileMap[stem];
  if (direct) return direct;
  const ci = m.lowerMap[stem.toLowerCase()];
  if (ci) return m.fileMap[ci];
  return '';
}

/** Resolve a storage path that may include an extension (bgm04.ogg etc.). */
export function mediaUrlFromPath(p: string): string {
  if (!p) return '';
  const base = p.replace(/\\/g, '/').split('/').pop() || p;
  const dot = base.lastIndexOf('.');
  return mediaUrl(dot > 0 ? base.slice(0, dot) : base);
}

/** Stage tag + time token -> background file stem ("bg04_a"). */
export function stageStem(stageName: string, timeToken?: string): string {
  const m = cache;
  if (!m) return stageName;
  const stage = m.envinit.stages[stageName];
  if (!stage?.image) return stageName;
  let time = timeToken || m.envinit.defaultTime;
  if (!m.envinit.times[time]) time = m.envinit.defaultTime;
  const prefix = m.envinit.times[time]?.prefix ?? 'a';
  return stage.image.replace(/TIME/g, prefix);
}

export function timeDef(timeToken?: string): TimeDef | null {
  const m = cache;
  if (!m) return null;
  const t = timeToken && m.envinit.times[timeToken] ? timeToken : m.envinit.defaultTime;
  return m.envinit.times[t] || null;
}

/** Classify a character invocation token using envinit + sprite metadata. */
export type TokenKind =
  | 'pose' | 'dress' | 'diff' | 'face' | 'xpos'
  | 'level' | 'show' | 'hide' | 'faceDisp' | 'hideClear' | 'hideInvisible'
  | 'transition' | 'action'
  | 'front' | 'flag' | 'unknown';

const FLAG_WORDS = new Set([
  'sync', 'nosync', 'wait', 'nowait', 'canskip', 'notrans', 'force', 'left', 'right',
  'normal', 'quickfade', 'superquick', 'stop', 'show', 'hide', 'on', 'off', 'reset',
]);

export function classifyToken(charName: string, token: string): TokenKind {
  const m = cache;
  if (!m) return 'unknown';
  if (token.startsWith('ポーズ')) {
    const ci = m.charmeta.characters[resolveRegisteredName(charName)];
    if (ci?.poses.some(p => p.pose === token)) return 'pose';
  }
  const reg = resolveRegisteredName(charName);
  const ci = m.charmeta.characters[reg];
  if (ci) {
    for (const ref of ci.poses) {
      const meta = m.charmeta.poses[ref.base];
      if (!meta) continue;
      if (meta.dresses.some(d => d.dress === token)) return 'dress';
      if (meta.dresses.some(d => d.diff === token)) return 'diff';
      if (meta.faces.some(f => f.expression === token)) return 'face';
    }
  }
  const pos = m.envinit.positions[token];
  if (pos) {
    const t = pos.type?.$const || '';
    if (t.includes('XPOSITION')) return 'xpos';
    if (t.includes('LEVEL')) return 'level';
    if (t.includes('DISPPOSITION')) {
      const disp = pos.disp?.$const || '';
      // KAGEnvImage: BOTH （出） / BU （立） show the body; FACE （顔） routes to
      // the message-window face only (body hidden); CLEAR （消） lets a later
      // pose/dress/position tag re-show automatically, INVISIBLE （無） does not.
      if (disp.includes('FACE')) return 'faceDisp';
      if (disp.includes('INVISIBLE')) return 'hideInvisible';
      if (disp.includes('CLEAR')) return 'hideClear';
      return 'show'; // BOTH / BU
    }
  }
  if (token === '出' || token === '立' || token === '入') return 'show';
  if (token === '顔') return 'faceDisp';
  if (token === '消') return 'hideClear';
  if (token === '無') return 'hideInvisible';
  if (token === '前' || token === '奥' || token === '手前') return 'level';
  if (token === 'front' || token === 'back') return 'front';
  if (m.envinit.transitions[token]) return 'transition';
  if (m.envinit.actions[token]) return 'action';
  if (FLAG_WORDS.has(token.toLowerCase())) return 'flag';
  return 'unknown';
}

/**
 * KAGEnvImage character disposition (envinit DISPPOSITION):
 * both/bu = body on stage; face = message-window bust only; clear = erased
 * (a later pose/position tag auto re-shows); invisible = suppressed.
 */
export type CharDisp = 'both' | 'bu' | 'face' | 'clear' | 'invisible';

/**
 * Engine disp resolution for one character tag.
 * @param current  current disposition
 * @param explicit disposition carried by an explicit 出/立/顔/消/無 token
 * @param touched  the tag changed pose/dress/diff/face/xpos/level
 *
 * With no explicit token the engine SHOW auto-select keeps the current
 * disposition, except a CLEAR layer touched by the tag becomes BOTH;
 * INVISIBLE stays suppressed and FACE keeps the face-window state.
 */
export function resolveCharDisp(
  current: CharDisp,
  explicit: CharDisp | null,
  touched: boolean,
): CharDisp {
  if (explicit) return explicit;
  if (touched && current === 'clear') return 'both';
  return current;
}

/**
 * [allchar hide] re-emits the hide tag only to body-showing layers, so
 * BOTH/BU become CLEAR while FACE busts and already-hidden chars are left
 * alone. Returns the new disposition, or null when the char is untouched.
 */
export function allcharHideDisp(current: CharDisp): CharDisp | null {
  return current === 'both' || current === 'bu' ? 'clear' : null;
}

export function charBodyVisible(disp: CharDisp): boolean {
  return disp === 'both' || disp === 'bu';
}

/** Layer registration point (KAGEnvImage afx/afy). */
export type OriginX = 'left' | 'center' | 'right';
export type OriginY = 'top' | 'center' | 'bottom';

/**
 * KAGEnvImage.originMode 1–9 (clockwise from top-left); 0/other falls back
 * to the engine defaults (center/center).
 *   1 2 3     left-top    center-top right-top
 *   8 9 4  →  left-center center     right-center
 *   7 6 5     left-bottom center-bottom right-bottom
 */
export function originModeToAfAf(mode: number | string | null | undefined): { afx: OriginX; afy: OriginY } {
  switch (Number(mode)) {
    case 1: return { afx: 'left',   afy: 'top' };
    case 2: return { afx: 'center', afy: 'top' };
    case 3: return { afx: 'right',  afy: 'top' };
    case 4: return { afx: 'right',  afy: 'center' };
    case 5: return { afx: 'right',  afy: 'bottom' };
    case 6: return { afx: 'center', afy: 'bottom' };
    case 7: return { afx: 'left',   afy: 'bottom' };
    case 8: return { afx: 'left',   afy: 'center' };
    case 9: return { afx: 'center', afy: 'center' };
    default: return { afx: 'center', afy: 'center' };
  }
}

const PCT: Record<string, string> = {
  left: '0%', center: '-50%', right: '-100%',
  top: '0%', bottom: '-100%',
};

/** CSS transform that registers an element at xpos/ypos via afx/afy. */
export function originTranslate(afx: OriginX, afy: OriginY, dx = 0, dy = 0): string {
  return `translate(${PCT[afx]}, ${PCT[afy]}) translate(${dx}px, ${dy}px)`;
}

/**
 * View-origin (KAGEnvImage vorigin/orx/ory) in stage px: the point from
 * which xpos/ypos offsets are measured. Default ("center") is mid-stage
 * (400/300); vorigin=1 puts the origin at the top-left corner.
 */
export function originModeToViewPx(mode: number | string | null | undefined,
                                   stageW = 800, stageH = 600): { orx: number; ory: number } {
  const { afx, afy } = originModeToAfAf(mode);
  return { orx: originWordPxX(afx, stageW), ory: originWordPxY(afy, stageH) };
}

export function originWordPxX(word: string, stageW = 800): number {
  if (word === 'left' || word === 'top') return 0;
  if (word === 'right' || word === 'bottom') return stageW;
  return stageW / 2; // center
}

export function originWordPxY(word: string, stageH = 600): number {
  if (word === 'left' || word === 'top') return 0;
  if (word === 'right' || word === 'bottom') return stageH;
  return stageH / 2; // center
}

/** An `orx`/`ory` tag value: alignment word or a numeric px position. */
export function originParamPx(v: string | number | null | undefined,
                              axis: 'x' | 'y', stageW = 800, stageH = 600): number | null {
  if (v == null || v === '') return null;
  const s = String(v);
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s.trim())) return parseFloat(s);
  return axis === 'x' ? originWordPxX(s, stageW) : originWordPxY(s, stageH);
}

/** Layer placement inputs after model defaults have been applied. */
export interface LayerPlacementInput {
  xpos?: number | null;
  ypos?: number | null;
  orx?: number | null;
  ory?: number | null;
  afx?: OriginX;
  afy?: OriginY;
}

/**
 * Final top-left of a positioned layer in 800x600 stage coordinates.
 *
 * Engine formula (KAGEnvImage.calcPosition -> EnvGraphicLayer.recalcPosition,
 * camera/shift disabled for the event world and levelz=100 for simple
 * layers): the xpos/ypos offset is measured from the view origin (orx/ory,
 * default mid-stage 400/300, set by vorigin), and the image registration
 * point (afx/afy, default center) is placed there:
 *
 *   screenX = orx + xpos - afxFrac * imageWidth
 *
 * So a full-bleed 1100x900 scroll layer at xpos=0 lands at x=-150 (covers
 * the stage), while a vorigin=1 miniscene at xpos=353 lands at x=353.
 */
export function layerScreenPlacement(l: LayerPlacementInput, imgW: number, imgH: number,
                                     stageW = 800, stageH = 600): { x: number; y: number } {
  const fx = l.afx === 'left' ? 0 : l.afx === 'right' ? imgW : imgW / 2;
  const fy = l.afy === 'top' ? 0 : l.afy === 'bottom' ? imgH : imgH / 2;
  return {
    x: (l.orx ?? stageW / 2) + (l.xpos ?? 0) - fx,
    y: (l.ory ?? stageH / 2) + (l.ypos ?? 0) - fy,
  };
}

export function resolveRegisteredName(name: string): string {  const m = cache;
  if (!m) return name;
  if (m.charmeta.characters[name]) return name;
  // Runtime aliases registered by [newchar] (def.nameAlias points at the
  // character whose art/voice config is inherited).
  const alias = (m.envinit.characters[name] as any)?.nameAlias;
  if (alias && alias !== name) return resolveRegisteredName(alias);
  for (const [reg, def] of Object.entries(m.envinit.characters)) {
    if ((def as any).nameAlias === name) return reg;
  }
  return name;
}

export interface RenderedSpritePart {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
}

export interface RenderedSprite {
  /**
   * Trimmed compositing page, in manifest pixels: the engine composites the
   * pose on the PSD canvas and trims the union bounds of all layers at load,
   * then draws the result at native 1:1 pixels (levels are pre-rendered zoom
   * stages, not runtime-scaled sheets). Body/face coords are page-relative.
   */
  page: { x: number; y: number; w: number; h: number };
  body: RenderedSpritePart | null;
  face: RenderedSpritePart | null;
  /**
   * Message-window bust crop ("顔領域") in level-0 PSD canvas coords.
   * Only meaningful together with a level:0 render — the marker exists
   * on the level-0 page only.
   */
  faceRect: { left: number; top: number; width: number; height: number };
  /**
   * Level-0 bust composite descriptor, present only for level:0 renders.
   * Unlike `page` (the on-stage trim, also used as an approximation for
   * non-zero levels), the bust page is the FULL, UNTRIMMED authored level-0
   * PSD canvas: every pose frames its own 205×200 bust independently, so body
   * /face coords here are raw manifest coords and cross-pose face plates are
   * NOT valid (exstand getFaceArea/getFaceInfo are per-stand).
   */
  facePage?: {
    w: number;
    h: number;
    body: RenderedSpritePart | null;
    face: RenderedSpritePart | null;
    rect: { left: number; top: number; width: number; height: number };
  };
  /** Final placement offsets relative to the (center-x, baseline-y) anchor. */
  offsetX: number;
  offsetY: number;
}

/** Baseline y of the character anchor below stage center (envinit yoffset). */
export function envYOffset(): number {
  return cache?.envinit.yoffset ?? 0;
}

/**
 * Resolve a dressed character pose into compositable PNG layers.
 * Body = costume Base(...) layer; face = expression code inside the same
 * costume group. Expressions missing from this pose fall back to a sibling
 * pose table (documented in docs/scenario_audit.txt).
 */
export function renderCharacter(
  charName: string,
  spec: { pose?: string; dress?: string; diff?: string; face?: string; level?: number },
): RenderedSprite | null {
  const m = cache;
  if (!m) return null;
  const reg = resolveRegisteredName(charName);
  const ci = m.charmeta.characters[reg];
  if (!ci || ci.poses.length === 0) return null;

  const poseRef =
    ci.poses.find(p => p.pose === spec.pose) ||
    ci.poses[0];
  const level = spec.level ?? m.envinit.defaultLevel ?? 1;
  let meta = m.charmeta.poses[poseRef.base];
  if (!meta) return null;

  const levelKey = String(level);
  const layers = meta.levels[levelKey] || meta.levels['1'] || Object.values(meta.levels)[0];
  const canvas = meta.canvas[levelKey] || meta.canvas['1'] || [278, 961];

  // Message-window bust area (exstand getFaceArea): a level-0 marker layer,
  // preferring a dress-specific "<dress>顔領域" over the generic one.
  const level0 = meta.levels['0'];
  const faceMarker =
    (spec.dress && level0?.find(l => l.name === `${spec.dress}顔領域`)) ||
    level0?.find(l => l.name === '顔領域');
  const faceRect = faceMarker
    ? { left: faceMarker.left, top: faceMarker.top, width: faceMarker.width, height: faceMarker.height }
    : { left: 0, top: 0, width: 205, height: 200 };

  const dressRow =
    meta.dresses.find(d => d.dress === spec.dress && (d.diff === spec.diff || !spec.diff)) ||
    meta.dresses.find(d => d.dress === spec.dress) ||
    meta.dresses.find(d => d.diff === spec.diff) ||
    meta.dresses[0];
  // _info rows carry a folder prefix ("seihuku_ab/Base(seihuku_ab)") while
  // manifest rows are named "Base(seihuku_ab)".
  const baseName = (s: string) => s.split('/').pop() || s;
  const baseRow = layers.find(l => l.name === dressRow?.layer || l.name === baseName(dressRow?.layer || ''));

  let body: RenderedSpritePart | null = null;
  if (baseRow) {
    const url = mediaUrl(`${poseRef.base}_${level}_${baseRow.layer_id}`);
    if (url) {
      body = part(url, baseRow);
    }
  }

  // face: expression code within the base layer's costume group.
  let face: RenderedSpritePart | null = null;
  if (spec.face && baseRow) {
    const faceCode = meta.faces.find(f => f.expression === spec.face)?.layer;
    let faceRow = faceCode ? layers.find(l => l.name === faceCode && l.group_id === baseRow.group_id) : null;
    let faceBase = poseRef.base;
    // Cross-pose fallback is valid only for the shared full-stand frames of
    // levels 1/2. Level-0 pages are per-pose authored bust crops whose face
    // plates use incompatible coordinates; a missing expression there means
    // body-only, exactly like the engine's per-stand getFaceInfo().
    if (!faceRow && level !== 0) {
      // cross-pose fallback
      for (const other of ci.poses) {
        if (other.base === poseRef.base) continue;
        const om = m.charmeta.poses[other.base];
        if (!om) continue;
        const code = om.faces.find(f => f.expression === spec.face)?.layer;
        if (!code) continue;
        const ol = om.levels[levelKey] || om.levels['1'];
        const oBase = ol.find(l => l.name === om.dresses[0]?.layer || l.name === baseName(om.dresses[0]?.layer || ''));
        const cand = ol.find(l => l.name === code && (!oBase || l.group_id === oBase.group_id));
        if (cand) {
          faceRow = cand;
          faceBase = other.base;
          break;
        }
      }
    }
    if (faceRow) {
      const url = mediaUrl(`${faceBase}_${level}_${faceRow.layer_id}`);
      if (url) face = part(url, faceRow);
    }
  }

  // Engine placement (system/exstand.tjs): each level is a pre-rendered zoom
  // stage drawn at native 1:1 pixels. The composited PSD page is trimmed at
  // load to the union bounds of every non-auxiliary layer, then placed with a
  // bottom-center anchor at (env.xmax, env.ymax + env.yoffset):
  //   left = 400 + (poseX + charlevelX + xpos) - pageW/2
  //   top  = 300 + (envY + poseY - charlevelY - ypos) - pageH
  // charlevel y is up-positive in the CSV. Auxiliary marker layers
  // (顔領域 etc., level 0 only) are excluded from the trim region.
  const IGNORED = /領域|原点|背景/;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of layers) {
    if (IGNORED.test(l.name)) continue;
    if (l.width <= 0 || l.height <= 0) continue;
    minX = Math.min(minX, l.left);
    minY = Math.min(minY, l.top);
    maxX = Math.max(maxX, l.left + l.width);
    maxY = Math.max(maxY, l.top + l.height);
  }
  const page = isFinite(minX)
    ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    : { x: 0, y: 0, w: canvas[0], h: canvas[1] };

  const offs = ci.level_offsets?.[poseRef.pose]?.[level];
  const offsetX = (poseRef.xoffset ?? 0) + (offs?.x ?? 0);
  const offsetY = (poseRef.yoffset ?? 0) - (offs?.y ?? 0);

  // Shift the chosen body/face parts from canvas coords to page coords.
  const toPage = (p: RenderedSpritePart | null): RenderedSpritePart | null =>
    p ? { ...p, x: p.x - page.x, y: p.y - page.y } : null;

  // Level-0 bust: descriptor on the full untrimmed authored canvas with raw
  // (pre-trim) layer coords; the 顔領域 rect indexes this page directly.
  let facePage: RenderedSprite['facePage'];
  if (level === 0) {
    const fc = meta.canvas['0'] || [205, 200];
    facePage = { w: fc[0], h: fc[1], body, face, rect: faceRect };
  }

  return {
    page,
    body: toPage(body),
    face: toPage(face),
    faceRect,
    facePage,
    offsetX,
    offsetY,
  };
}

function part(url: string, l: SpriteLayer): RenderedSpritePart {
  return { url, x: l.left, y: l.top, w: l.width, h: l.height, opacity: (l.opacity ?? 255) / 255 };
}

/** Resolve a scenario storage ("lave02.ks", "start.ks") to a fetch path. */
export function scenarioPath(storage: string): string {
  const m = cache;
  const base = storage.replace(/\.ks$/i, '');
  if (base.includes('/')) return `/scenarios/${base}.json`;
  if (m) {
    const hit = m.scenarios.find(s => s.storage.endsWith('/' + base) || s.name === base);
    if (hit) return `/scenarios/${hit.storage}.json`;
  }
  return `/scenarios/scenario/${base}.json`;
}

export function findLabelIndex(instructions: any[], label: string): number {
  const bare = label.startsWith('*') ? label.slice(1) : label;
  const idx = instructions.findIndex(
    i => i.type === 'label' && (i.name === bare || i.name === label),
  );
  return idx; // -1 when missing; callers must NOT fall back to 0
}
