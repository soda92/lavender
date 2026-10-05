/**
 * Scene-recollection index, served from the engine's main/scenelist.csv
 * (parsed by the Go server). Each entry is an H-scene wrapped by the
 * memory_begin / memory_end labels; the original engine replays it via
 * sysscn/scenemode.tjs. The CSV orders scenes per heroine as
 * lave42_* (route second act), lave41_* (route first act), epilogue — the
 * gallery lists them in story order instead.
 */

export interface SceneEntry {
  id: string;
  heroine: string;
  thumb: string; // /thum/thumb2_*.png
  orig: string;  // representative event-CG tag, used for the unlock check
  storage: string;
  startLabel: string;
  endLabel: string;
}

export const SCENE_HEROINES = ['akina', 'haruka', 'hikaru', 'reika', 'riko'] as const;

/** Story chronology inside a route: confession act (lave41_*), second act
 *  (lave42_*), then the epilogue file (lave.<heroine>*). */
function storyRank(storage: string): number {
  if (/^lave41_/i.test(storage)) return 0;
  if (/^lave42_/i.test(storage)) return 1;
  return 2;
}

export function sortScenes(scenes: SceneEntry[]): SceneEntry[] {
  const heroRank = (h: string) => {
    const i = SCENE_HEROINES.indexOf(h as (typeof SCENE_HEROINES)[number]);
    return i < 0 ? SCENE_HEROINES.length : i;
  };
  return [...scenes].sort((a, b) =>
    heroRank(a.heroine) - heroRank(b.heroine) ||
    storyRank(a.storage) - storyRank(b.storage) ||
    a.storage.localeCompare(b.storage),
  );
}

export function isSceneUnlocked(seen: Record<string, boolean>, s: SceneEntry): boolean {
  return !!seen[s.orig] || !!seen[`${s.orig}_l`];
}
