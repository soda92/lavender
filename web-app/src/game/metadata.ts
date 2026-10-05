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
  | 'level' | 'show' | 'hide' | 'transition' | 'action'
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
      // BOTH （出） / BU （立） / FACE （顔） show; INVISIBLE （無） and CLEAR （消） hide.
      return disp.includes('BOTH') || disp.includes('BU') || disp.includes('FACE') ? 'show' : 'hide';
    }
  }
  if (token === '出' || token === '立' || token === '入') return 'show';
  if (token === '消' || token === '無') return 'hide';
  if (token === '前' || token === '奥' || token === '手前') return 'level';
  if (token === 'front' || token === 'back') return 'front';
  if (m.envinit.transitions[token]) return 'transition';
  if (m.envinit.actions[token]) return 'action';
  if (FLAG_WORDS.has(token.toLowerCase())) return 'flag';
  return 'unknown';
}

export function resolveRegisteredName(name: string): string {
  const m = cache;
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
  canvas: [number, number];
  scale: number;
  body: RenderedSpritePart | null;
  face: RenderedSpritePart | null;
  offsetX: number;
  offsetY: number;
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
    if (!faceRow) {
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

  // Per-level sheets are resolution variants of the same art (level-2 sheets
  // are ~2x the pixels, not 2x the display size): every level is scaled so the
  // canvas height maps to STAGE_H. The per-pose/per-level charlevel offsets
  // (up/right positive) then choose the crop: level-2 y is ~-canvasH/2, which
  // centers the sheet at stage height and presents the upper body as a 手前
  // foreground composition. CharacterView positions by center anchor.
  const scale = 1;
  const offs = ci.level_offsets?.[poseRef.pose]?.[level];

  return {
    canvas,
    scale,
    body,
    face,
    offsetX: offs?.x ?? 0,
    offsetY: offs?.y ?? 0,
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
