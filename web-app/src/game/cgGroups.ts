/**
 * Event CG gallery model.
 *
 * Canonical data comes from /api/cglist, which mirrors the engine's
 * main/cglist.csv: per-heroine sections, shipped /thum thumbnails and the
 * ordered variant sequence for each tile (including ev_stex + fgimage
 * overlay frames). The filename-derived grouping below only remains as an
 * offline fallback for when the index is unavailable.
 */

export interface CgVariant {
  /** Event-CG stem, served from /evimage. */
  stem: string;
  /** Foreground face-layer stem (served from /fgimage/面付), if any. */
  overlay?: string;
  /** Full image URL (derived). */
  url: string;
}

export interface CgTile {
  /** Thumbnail stem, unique within the gallery. */
  id: string;
  /** Shipped thumbnail URL under /thum. */
  thumb: string;
  variants: CgVariant[];
}

export interface CgSection {
  /** Heroine token or "other"; "" only possible in malformed data. */
  id: string;
  tiles: CgTile[];
}

/** Section / face-rail order as shipped in cglist.csv. */
export const GALLERY_SECTIONS = ['hikaru', 'haruka', 'reika', 'riko', 'akina', 'other'] as const;

export const evImageUrl = (stem: string) => `/evimage/${stem}.png`;
export const overlayUrl = (stem: string) =>
  `/fgimage/${encodeURIComponent('面付')}/${stem}.png`;

/** Normalizes the server /api/cglist payload with derived URLs. */
export function normalizeSections(data: any[]): CgSection[] {
  if (!Array.isArray(data)) return [];
  return data.map((s: any) => ({
    id: String(s.id ?? ''),
    tiles: (Array.isArray(s.tiles) ? s.tiles : []).map((t: any) => ({
      id: String(t.id ?? ''),
      thumb: String(t.thumb ?? ''),
      variants: (Array.isArray(t.variants) ? t.variants : []).map((v: any) => ({
        stem: String(v.stem ?? ''),
        ...(v.overlay ? { overlay: String(v.overlay) } : {}),
        url: evImageUrl(String(v.stem ?? '')),
      })),
    })),
  }));
}

// ---------------------------------------------------------------------------
// Fallback grouping from a raw /api/media?dir=evimage listing.
// ---------------------------------------------------------------------------

const HEROINES = new Set(['akina', 'haruka', 'hikaru', 'reika', 'riko']);

/** Natural-order compare: ev_2 < ev_10, case-insensitive for letter runs. */
export function naturalCompare(a: string, b: string): number {
  const ta = a.toLowerCase().split(/(\d+)/);
  const tb = b.toLowerCase().split(/(\d+)/);
  for (let i = 0; i < Math.min(ta.length, tb.length); i++) {
    if (i % 2 === 1) {
      const d = Number(ta[i]) - Number(tb[i]);
      if (d) return d;
    } else if (ta[i] !== tb[i]) {
      return ta[i] < tb[i] ? -1 : 1;
    }
  }
  return ta.length - tb.length;
}

/** ev_akina_02c_l -> ev_akina_02 ; ev_hikaru_03ab -> ev_hikaru_03. */
export function cgGroupKey(stem: string): string {
  let s = stem.replace(/_l$/i, '');
  const m = s.match(/^(.*\d+)[a-z]+$/i);
  return m ? m[1] : s;
}

/** Heroine prefix (ev_* / ev_*_h / ev_c_* / ev_stex_*) or "other". */
export function categoryOf(stem: string): string {
  const m = stem.match(/^ev_(?:c_)?(?:stex_)?([a-z]+)/i);
  const tok = m?.[1]?.toLowerCase() ?? '';
  return HEROINES.has(tok) ? tok : 'other';
}

/** Heuristic variant grouping (fallback only). */
export function buildCgGroups(urls: string[]): CgTile[] {
  const map = new Map<string, CgTile>();
  for (const url of urls) {
    const stem = decodeURIComponent(url.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
    // The _l framing is the same image as its partner; never its own tile.
    if (/_l$/i.test(stem)) continue;
    const id = cgGroupKey(stem);
    let g = map.get(id);
    if (!g) {
      g = { id, thumb: evImageUrl(stem), variants: [] };
      map.set(id, g);
    }
    g.variants.push({ stem, url });
  }
  for (const g of map.values()) {
    g.variants.sort((a, b) => naturalCompare(a.stem, b.stem));
  }
  return [...map.values()].sort((a, b) => naturalCompare(a.id, b.id));
}

/** Buckets heuristic tiles into the shipped section order (fallback only). */
export function buildFallbackSections(urls: string[]): CgSection[] {
  const tiles = buildCgGroups(urls);
  const buckets = new Map<string, CgTile[]>();
  for (const id of GALLERY_SECTIONS) buckets.set(id, []);
  for (const tile of tiles) {
    const cat = categoryOf(tile.id);
    buckets.get(cat)?.push(tile);
  }
  return GALLERY_SECTIONS
    .map(id => ({ id, tiles: buckets.get(id) ?? [] }))
    .filter(s => s.tiles.length > 0);
}
