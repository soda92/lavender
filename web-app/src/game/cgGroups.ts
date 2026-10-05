/**
 * Event CG grouping. The shipped evimage assets store one gallery CG as
 * multiple files: numbered letter variants (ev_akina_02a/02b/02c — the
 * expression/pose differences inside one still). Each variant also ships an
 * "_l" framing, but it is pixel-identical content, so those files are ignored
 * here (they only survive as unlock aliases in the gallery). The G-senjou
 * reference gallery folds all variants of one CG under a single tile and lets
 * the viewer page through them; these helpers derive the same grouping
 * automatically from the filename conventions.
 */

export interface CgVariant {
  stem: string;
  url: string;
}

export interface CgGroup {
  /** Shared base stem, e.g. ev_akina_02 covers 02a/02b/02c(_l). */
  id: string;
  category: string;
  variants: CgVariant[];
}

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

export function buildCgGroups(urls: string[]): CgGroup[] {
  const map = new Map<string, CgGroup>();
  for (const url of urls) {
    const stem = decodeURIComponent(url.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
    // The _l framing is the same image as its partner; never its own tile.
    if (/_l$/i.test(stem)) continue;
    const id = cgGroupKey(stem);
    let g = map.get(id);
    if (!g) {
      g = { id, category: categoryOf(id), variants: [] };
      map.set(id, g);
    }
    g.variants.push({ stem, url });
  }
  for (const g of map.values()) {
    g.variants.sort((a, b) => naturalCompare(a.stem, b.stem));
  }
  return [...map.values()].sort((a, b) => naturalCompare(a.id, b.id));
}
