/**
 * Gallery unlock predicate, matching the engine's gallery modes:
 *
 *   isSeen(num)  ->  tf.allseen || sf[items[num].seenflag]
 *
 * (sysscn/soundmode.tjs, cgmode.tjs:551, scenemode.tjs:91). `tf.allseen`
 * is the debug-menu "鑑賞モード全ON" master switch; in the web port it is
 * a persisted setting (sf.allSeen) instead of a session-only tf flag.
 */
export function itemSeen(
  allSeen: boolean | undefined,
  seen: Record<string, boolean | undefined> | undefined,
  key: string,
): boolean {
  return !!allSeen || !!seen?.[key];
}

/** True when the master switch is on or ANY of the flag keys is set. */
export function anySeen(
  allSeen: boolean | undefined,
  seen: Record<string, boolean | undefined> | undefined,
  keys: readonly string[],
): boolean {
  return !!allSeen || keys.some(k => !!seen?.[k]);
}
