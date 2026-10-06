/**
 * System-flag hydration merge.
 *
 * sf is persisted two ways: synchronously to localStorage and (debounced) to
 * the server. When a POST is rejected (e.g. another tab owns the heartbeat),
 * the server copy can be older than the local one. Hydration therefore layers
 * three sources — defaults < localStorage < server — instead of letting the
 * server copy clobber local-only changes. The server wins per leaf whenever it
 * actually carries a value; the local copy only fills gaps.
 *
 * Progress maps are nested and must be unioned, not replaced:
 *   bgmSeen / cgSeen / voiceMute / voiceGain  -> { key: value }
 *   readScenarios                              -> { file: { ptr: bool } }
 */
const ONE_LEVEL_MAPS = new Set(['bgmSeen', 'cgSeen', 'voiceMute', 'voiceGain']);
const TWO_LEVEL_MAPS = new Set(['readScenarios']);

function isRecord(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Union two record-of-records maps; `win` wins per inner leaf. */
function mergeTwoLevel(lose: unknown, win: unknown): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of isRecord(lose) ? Object.entries(lose) : []) {
    out[k] = isRecord(v) ? { ...v } : v;
  }
  if (isRecord(win)) {
    for (const [k, v] of Object.entries(win)) {
      out[k] = isRecord(v)
        ? { ...(isRecord(out[k]) ? out[k] : {}), ...v }
        : v;
    }
  }
  return out;
}

/**
 * Merge one hydrated layer into the accumulator. Scalars are replaced when
 * present; known progress maps are unioned; unknown plain objects are shallow
 * merged defensively.
 */
function layerInto(acc: Record<string, any>, layer: unknown): Record<string, any> {
  if (!isRecord(layer)) return acc;
  for (const [key, val] of Object.entries(layer)) {
    if (val === undefined || val === null) continue;
    if (TWO_LEVEL_MAPS.has(key)) {
      acc[key] = mergeTwoLevel(acc[key], val);
    } else if (ONE_LEVEL_MAPS.has(key)) {
      acc[key] = { ...(isRecord(acc[key]) ? acc[key] : {}), ...(isRecord(val) ? val : {}) };
    } else if (isRecord(val) && isRecord(acc[key])) {
      acc[key] = { ...acc[key], ...val };
    } else {
      acc[key] = val;
    }
  }
  return acc;
}

export function mergeSfHydration(
  defaults: Record<string, any>,
  ...layers: unknown[]
): Record<string, any> {
  return layers.reduce<Record<string, any>>(
    (acc, layer) => layerInto(acc, layer),
    { ...defaults },
  );
}
