import { useState, useEffect, useRef, useCallback } from 'react';
import {
  loadMetadata,
  mediaUrl,
  stageStem,
  timeDef,
  classifyToken,
  resolveRegisteredName,
  scenarioPath,
  findLabelIndex,
  getMeta,
  resolveCharDisp,
  allcharHideDisp,
  charBodyVisible,
  originModeToAfAf,
  originModeToViewPx,
  originParamPx,
} from '../game/metadata';
import type { EnvInit, CharDisp } from '../game/metadata';
export type { CharDisp } from '../game/metadata';
import { debugMs } from '../game/debugTiming';

// ---------------------------------------------------------------------------
// World state
// ---------------------------------------------------------------------------

export interface CharState {
  name: string;
  visible: boolean;
  /** KAGEnvImage disposition: both/bu = body on stage; face = face-window
   *  only; clear = erased (a later pose tag re-shows); invisible = suppressed
   *  (a later pose tag does NOT re-show). */
  disp: CharDisp;
  front: boolean;
  level: number;
  xpos: number;
  opacity: number;
  pose?: string;
  dress?: string;
  diff?: string;
  face?: string;
  /** Fading out after a hide (engine charDispTrans crossfade 300ms). */
  leaving?: boolean;
  /** Show transition: start offset dx px (showaction MoveAction) + duration. */
  enterAnim?: { dx: number; ms: number; nonce: number };
  /** Hide transition: end offset dx px (hideaction MoveAction) + duration. */
  exitAnim?: { dx: number; ms: number; nonce: number };
}

export interface LayerAnimTrack {
  nonce: number;
  ms: number;
  easing: string;
}
export interface LayerPosTrack extends LayerAnimTrack {
  from: { x: number; y: number };
  to: { x: number; y: number };
}
export interface LayerOpTrack extends LayerAnimTrack {
  from: number;
  to: number;
}
export interface LayerAnim {
  pos?: LayerPosTrack;
  op?: LayerOpTrack;
}

export interface DynLayer {
  name: string;
  file?: string;
  visible: boolean;
  front: boolean;
  level: number;
  xpos: number | null;
  ypos: number | null;
  opacity: number;
  /** Registration point (KAGEnvImage afx/afy); default center. */
  afx: 'left' | 'center' | 'right';
  afy: 'top' | 'center' | 'bottom';
  /**
   * View origin in stage px (KAGEnvImage vorigin/orx/ory): the point xpos/
   * ypos are measured from. Defaults to mid-stage 400/300; vorigin=1 makes
   * xpos/ypos name top-left stage coordinates.
   */
  orx: number | null;
  ory: number | null;
  /** Scripted time= tweens of position/opacity (large-art pans/fades). */
  anim?: LayerAnim;
}

export interface EnvAdjust {
  grayscale?: boolean;
  rgamma?: number;
  ggamma?: number;
  bgamma?: number;
}

export interface BgEffect {
  zoom?: number;      // layer zoom percent (100 = native 1:1)
  xpos?: number;
  ypos?: number;
  camerax?: number;   // global camera offsets (subtracted from xpos/ypos)
  cameray?: number;
  camerazoom?: number;
  shiftx?: number;
  shifty?: number;
  blur?: number;
  brightness?: number;
}

// Camera attribute keys accepted on stage tags and bare [bg] tags.
const BG_CAM_KEYS = ['zoom', 'xpos', 'ypos', 'camerax', 'cameray', 'camerazoom', 'shiftx', 'shifty', 'blur', 'brightness'] as const;

export interface StageState {
  bg: { stem: string; time: string } | null;
  bgEffect: BgEffect;
  bgHidden: boolean;
  chars: Record<string, CharState>;
  layers: Record<string, DynLayer>;
  envAdjust: EnvAdjust;
  quake: { h: number; v: number; key: number } | null;
}

export interface ChoiceOption {
  text: string;
  target: string;
  storage?: string;
  exp?: string; // seladd exp="..." runs when this branch is chosen
}

export interface HistoryItem {
  speaker: string;
  text: string;
  voice: string;
  scenario: string;
  pointer: number;
}

type GameState = 'TITLE' | 'PLAYING' | 'SETTINGS' | 'GALLERY';

interface SaveSlot {
  currentScenario: string;
  pointer: number;
  f: Record<string, any>;
  sf: Record<string, any>;
  tf: Record<string, any>;
  stage: StageState;
  bgm: string | null;
  speaker: string;
  dialogueText: string;
  timestamp?: number;
  date?: string;
  note?: string;
  pinned?: boolean;
  historyLog?: HistoryItem[];
}

// Parses an engine MoveAction relative spec ("@", "@-100", "@+200") into a
// pixel delta relative to the current property value.
function parseMoveRel(spec: unknown): number {
  if (typeof spec !== 'string' || spec === '@') return 0;
  const m = /^@([+-]?\d+)$/.exec(spec);
  return m ? parseInt(m[1], 10) : 0;
}

// Maps an Akabei endtrans method name to a CSS animation + default duration.
// Custom mask rules (Japanese names) are approximated with directional slides.
function transAnim(method: string): { cls: string; ms: number } {
  if (method.includes('高速')) {
    if (method.includes('左')) return { cls: 'tr-slide-l', ms: 250 };
    if (method.includes('右')) return { cls: 'tr-slide-r', ms: 250 };
    if (method.includes('上')) return { cls: 'tr-slide-u', ms: 250 };
    return { cls: 'tr-slide-d', ms: 250 };
  }
  if (method.includes('右')) return { cls: 'tr-slide-r', ms: 500 };
  if (method.includes('左')) return { cls: 'tr-slide-l', ms: 500 };
  if (method.includes('上')) return { cls: 'tr-slide-u', ms: 500 };
  if (method.includes('下')) return { cls: 'tr-slide-d', ms: 500 };
  switch (method) {
    case 'superquick': return { cls: 'tr-fade', ms: 120 };
    case 'quickfade': return { cls: 'tr-fade', ms: 250 };
    case 'normal': return { cls: 'tr-fade', ms: 300 };
    case 'universal': return { cls: 'tr-fade', ms: 400 };
    case 'midfade': return { cls: 'tr-fade', ms: 600 };
    case 'longfade': return { cls: 'tr-fade', ms: 1000 };
    default: return { cls: 'tr-fade', ms: 350 };
  }
}

const EMPTY_STAGE: StageState = {
  bg: null,
  bgEffect: {},
  bgHidden: false,
  chars: {},
  layers: {},
  envAdjust: {},
  quake: null,
};

// KAG skip constants used inside iscript expressions.
const KAG_CONSTS: Record<string, number> = {
  SKIP_NONE: 0,
  SKIP_CANCEL: 2,
  SKIP_ALL: 1,
  SKIP_NOWAIT: 3,
};

function sandboxEval(exp: string, f: any, sf: any, tf: any, skipMode: number, isRecollection = false): any {
  const cleaned = String(exp)
    .replace(/^&@?/, '')
    .replace(/&(?=[a-zA-Z_$])/g, '')
    .trim();
  if (cleaned.startsWith('@')) {
    // @"..." literal form
    return cleaned.slice(1).replace(/^"|"$/g, '');
  }
  try {
    const fn = new Function(
      'f', 'sf', 'tf', 'kag', 'mp', ...Object.keys(KAG_CONSTS),
      `"use strict"; return (${cleaned});`,
    );
    return fn(
      f, sf, tf,
      { skipMode, isRecollection },
      {},
      ...Object.values(KAG_CONSTS),
    );
  } catch (e) {
    console.warn('eval failed:', exp, e);
    return undefined;
  }
}

/**
 * Expand a KAG command attribute. Attributes prefixed with "&" are
 * expressions: &expr evaluates in the f/sf/tf sandbox; &@"..." is a raw
 * here-string containing ${expr} interpolations (used for variant artwork
 * such as ev_riko_h_05a${f.rikoh_suffix}_l).
 */
function expandKagArg(raw: unknown, f: any, sf: any, tf: any, skip: number): unknown {
  if (typeof raw !== 'string' || raw[0] !== '&') return raw;
  const s = raw.slice(1);
  if (s.startsWith('@')) {
    const lit = s.slice(1).replace(/^"|"$/g, '');
    return lit.replace(/\$\{([^}]*)\}/g, (_m, expr: string) => {
      const v = sandboxEval(expr.trim(), f, sf, tf, skip);
      return v == null ? '' : String(v);
    });
  }
  const v = sandboxEval(raw, f, sf, tf, skip);
  return v == null ? raw : v;
}

// ---------------------------------------------------------------------------

export function useKagRunner(audio: {
  playBgm: (s: string) => void;
  stopBgm: () => void;
  playSe: (s: string) => void;
  playVoice: (s: string) => void;
  stopVoice: () => void;
  currentVoiceRef: React.MutableRefObject<string | null>;
}) {
  const [metaReady, setMetaReady] = useState(false);
  const [gameState, setGameState] = useState<GameState>('TITLE');
  const [currentScenario, setCurrentScenario] = useState('start');
  const [pointer, setPointer] = useState(0);
  const [stage, setStage] = useState<StageState>(structuredClone(EMPTY_STAGE));
  // True while a navigator seek silently rebuilds the scene: char fades are
  // suppressed so the scrubbed scene doesn't trail ghosts.
  const [isSeeking, setIsSeeking] = useState(false);
  const [stageTransition, setStageTransition] = useState<{
    old: StageState; cls: string; ms: number; key: number;
  } | null>(null);
  const [speaker, setSpeaker] = useState('');
  const [dialogueText, setDialogueText] = useState('');
  const dialogueRef = useRef('');
  useEffect(() => { dialogueRef.current = dialogueText; }, [dialogueText]);
  const [typewriterText, setTypewriterText] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [textVisible, setTextVisible] = useState(true);
  const [choiceOptions, setChoiceOptions] = useState<ChoiceOption[] | null>(null);
  const [bgmStem, setBgmStem] = useState<string | null>(null);
  const [currentVoice, setCurrentVoice] = useState('');
  const [video, setVideo] = useState<{ stem: string } | null>(null);
  const videoRef = useRef<{ stem: string } | null>(null);
  const [historyLog, setHistoryLog] = useState<HistoryItem[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  // Unified docked side panel: which tab is open, or null when closed.
  const [sideTab, setSideTab] = useState<string | null>(null);
  // Authentic full-stage config overlay (config_{system,sound,shortcut}).
  const [configOpen, setConfigOpen] = useState(false);
  const configOpenRef = useRef(false);
  const setConfigOpenWrapped = useCallback((v: boolean) => {
    configOpenRef.current = v;
    setConfigOpen(v);
  }, []);
  // dialog.csv Yes/No popup: ask() resolves when the player answers.
  const [askDialog, setAskDialog] = useState<string | null>(null);
  const askResolverRef = useRef<((yes: boolean) => void) | null>(null);
  const askOpenRef = useRef(false);
  // Manual message-window erase (Space), independent of script msgoff/msgon.
  const [windowHidden, setWindowHidden] = useState(false);
  const windowHiddenRef = useRef(false);
  useEffect(() => { windowHiddenRef.current = windowHidden; }, [windowHidden]);
  const [scenarioInstructions, setScenarioInstructions] = useState<any[]>([]);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isFastForward, setIsFastForward] = useState(false);
  const [language, setLanguage] = useState<'JP' | 'EN'>('JP');
  const [sessionConflict, setSessionConflict] = useState(false);

  const [f, setF] = useState<Record<string, any>>({});
  const [sfState, setSfState] = useState<Record<string, any>>({
    vol: 8,
    sevol: 8,
    skipMode: 'ALL',
    immerseMode: false,
    readScenarios: {},
    bgmSeen: {},
    cgSeen: {},
    // config overlay defaults (option.tjs CustomOption); progress keys
    // (readScenarios/bgmSeen/cgSeen) are never reset by 初期化.
    designCursor: true,
    drawPos: 120,
    showBGMTitle: true,
    confirmSave: true,
    confirmLoad: true,
    confirmQSave: true,
    confirmQLoad: true,
    textPos: 32,
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
  });
  const [tf, setTf] = useState<Record<string, any>>({});
  const [saveSlots, setSaveSlots] = useState<Record<string, SaveSlot>>({});

  // ---- refs mirroring state for the synchronous interpreter ----
  const envinitRef = useRef<EnvInit | null>(null);
  const dataRef = useRef<any[] | null>(null);
  const scenarioRef = useRef('start');
  const ptrRef = useRef(0);
  const stageRef = useRef<StageState>(structuredClone(EMPTY_STAGE));
  const fRef = useRef(f);
  const sfRef = useRef(sfState);
  const tfRef = useRef(tf);
  const speakerRef = useRef('');
  const voiceRef = useRef('');
  const waitingRef = useRef(false);
  const runningRef = useRef(false);
  const runTokenRef = useRef(0);
  const typingRef = useRef<{ full: string; timer: any } | null>(null);
  const freshLineRef = useRef(true);
  const pendingChoicesRef = useRef<ChoiceOption[]>([]);
  const choiceOpenRef = useRef(false);
  const autoRef = useRef(false);
  const fastRef = useRef(false);
  const rangeSkipRef = useRef(false); // inside beginskip/endskip
  const bgmRef = useRef<string | null>(null);
  const textVisibleRef = useRef(true);
  const historyRef = useRef<HistoryItem[]>([]);
  const storagePrefix = 'lavender';
  // Stable across reloads but per-tab (sessionStorage): a reloaded tab is the
  // same client, while two genuinely different tabs keep distinct IDs.
  const clientIdRef = useRef<string>(
    sessionStorage.getItem(`${storagePrefix}_cid`) ||
      (() => { const id = Math.random().toString(36).slice(2); sessionStorage.setItem(`${storagePrefix}_cid`, id); return id; })(),
  );
  const usernameRef = useRef('default');
  const quakeTimerRef = useRef<any>(null);
  const transOpenRef = useRef(false);            // between begintrans/endtrans
  const lastCommittedRef = useRef<StageState>(structuredClone(EMPTY_STAGE));
  const transitionTimerRef = useRef<any>(null);
  const transKeyRef = useRef(0);
  // Page-navigator / deep-link seek: silently replay commands from the file
  // start up to this pointer, rebuilding the stage without audio or waits.
  const seekRef = useRef<number | null>(null);
  const silentRef = useRef(false);
  // Scene recollection (engine "scenemode"): play the memory_begin..memory_end
  // span of a scenario and return to the gallery scene tab at the end label.
  const sceneReplayRef = useRef<{ storage: string; endLabel: string } | null>(null);
  const [sceneReplay, setSceneReplay] =
    useState<{ storage: string; endLabel: string } | null>(null);
  const [galleryViewMode, setGalleryViewMode] = useState<'cg' | 'scenes' | 'music'>('cg');
  // Indirection so the []-dep runSlice always calls the latest finisher.
  const finishSceneReplayRef = useRef<() => void>(() => {});

  useEffect(() => { fRef.current = f; }, [f]);
  useEffect(() => { sfRef.current = sfState; }, [sfState]);
  useEffect(() => { tfRef.current = tf; }, [tf]);
  useEffect(() => { autoRef.current = isAutoMode; }, [isAutoMode]);
  useEffect(() => { fastRef.current = isFastForward; }, [isFastForward]);

  // Surface progress in the URL fragment for debugging / quick inspection.
  useEffect(() => {
    if (gameState === 'PLAYING') {
      const hash = `#/${currentScenario}/${pointer}`;
      window.history.replaceState(null, '', hash);
    }
  }, [gameState, currentScenario, pointer]);

  // ---- metadata + heartbeat + state hydration ----
  useEffect(() => {
    let alive = true;
    loadMetadata().then(() => {
      if (!alive) return;
      envinitRef.current = getMeta()!.envinit;
      setMetaReady(true);
      hydrate();
      // Deep link: #/scenario/<file>/<pointer> (or #/<file>/<pointer>) boots
      // straight into PLAYING and replays the file up to that pointer.
      const hm = window.location.hash.match(/^#\/(?:scenario\/)?([^/]+)\/(\d+)\b/);
      if (hm) {
        const file = decodeURIComponent(hm[1]).replace(/\.ks$/i, '') + '.ks';
        const ptr = parseInt(hm[2], 10);
        stageRef.current = structuredClone(EMPTY_STAGE);
        lastCommittedRef.current = structuredClone(EMPTY_STAGE);
        historyRef.current = [];
        setHistoryLog([]);
        setGameState('PLAYING');
        void loadScenario(file, null, null, { seek: ptr });
      }
    });
    const beat = () => {
      fetch('/api/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientIdRef.current }),
      }).then(r => r.json()).then(j => {
        if (j.status === 'conflict') setSessionConflict(true);
      }).catch(() => {});
    };
    beat();
    const hb = setInterval(beat, 4000);
    return () => { alive = false; clearInterval(hb); };
  }, []);

  const sfFlushTimer = useRef<any>(null);
  const persistSf = useCallback((next: Record<string, any>) => {
    localStorage.setItem(`${storagePrefix}_sf`, JSON.stringify(next));
    clearTimeout(sfFlushTimer.current);
    sfFlushTimer.current = setTimeout(() => {
      fetch('/api/save-sf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Username': usernameRef.current,
          'X-Client-ID': clientIdRef.current,
        },
        body: JSON.stringify({ sf: next }),
      }).catch(() => {});
    }, 400);
  }, []);

  const setSf = useCallback((updater: any) => {
    setSfState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      sfRef.current = next;
      persistSf(next);
      return next;
    });
  }, [persistSf]);

  async function hydrate() {
    try {
      const r = await fetch('/api/state', { headers: { 'X-Username': usernameRef.current } });
      const state = await r.json();
      if (state.sf) setSf(prev => ({ ...prev, ...state.sf }));
      const slots: Record<string, SaveSlot> = {};
      for (const [id, data] of Object.entries<any>(state.slots || {})) {
        if (data && (data.stage || data.currentScenario)) slots[id] = data as SaveSlot;
      }
      // Unlimited dynamic slots: merge any local copies (server wins on
      // overlap; note/pin are persisted server-side going forward).
      const localIds: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || '';
        if (key.startsWith(`${storagePrefix}_save_slot_`)) {
          localIds.push(key.slice(`${storagePrefix}_save_slot_`.length));
        }
      }
      for (const id of localIds) {
        try {
          const local = JSON.parse(localStorage.getItem(`${storagePrefix}_save_slot_${id}`) || '{}');
          slots[id] = { ...local, ...(slots[id] || {}) };
        } catch { /* ignore */ }
      }
      const auto = localStorage.getItem(`${storagePrefix}_autosave`);
      if (auto) {
        try { slots.autosave = JSON.parse(auto); } catch { /* ignore */ }
      }
      setSaveSlots(slots);
    } catch { /* offline */ }
  }

  // -------------------------------------------------------------------------
  // Stage mutation helpers
  // -------------------------------------------------------------------------

  // Fade-out timers for chars hidden outside a transition block.
  const leavingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const animNonceRef = useRef(0);

  const clearLeavingTimers = () => {
    for (const t of Object.values(leavingTimersRef.current)) clearTimeout(t);
    leavingTimersRef.current = {};
  };

  const pruneLeaving = (name: string) => {
    delete leavingTimersRef.current[name];
    const cur = stageRef.current.chars[name];
    if (cur && !cur.visible) {
      delete stageRef.current.chars[name];
      const n2 = structuredClone(stageRef.current);
      lastCommittedRef.current = n2;
      if (!transOpenRef.current) setStage(n2);
    }
  };

  // Visual changes inside a begintrans/endtrans block mutate the draft but are
  // committed once at endtrans; outside blocks commit immediately.
  // transitional: an endtrans is committing — the whole-frame overlay already
  // crossfades hiders, so per-char leaving snapshots are not needed.
  const commitStage = (transitional = false) => {
    const prev = lastCommittedRef.current;
    const instant = fastRef.current || seekRef.current != null || silentRef.current;
    const next = structuredClone(stageRef.current);
    if (!transitional && !instant && prev) {
      for (const [name, ch] of Object.entries(next.chars)) {
        if (ch.visible && ch.leaving) {
          ch.leaving = false;
          const tm = leavingTimersRef.current[name];
          if (tm) { clearTimeout(tm); delete leavingTimersRef.current[name]; }
        } else if (!ch.visible && !ch.leaving && prev.chars[name]) {
          const pc = prev.chars[name];
          if (pc.leaving) {
            // An unrelated commit happened mid-fade: keep the snapshot until
            // its prune timer fires (the draft itself is flag-less).
            next.chars[name] = { ...pc, visible: false };
          } else if (pc.visible) {
            // Engine: char layers crossfade/slide on hide (charDispTrans or
            // the tag's named transition); keep the previous appearance as a
            // snapshot carrying the exit animation descriptor.
            const ms = ch.exitAnim?.ms ?? 300;
            next.chars[name] = {
              ...pc, visible: false, leaving: true,
              exitAnim: ch.exitAnim ?? { dx: 0, ms: 300, nonce: -1 },
            };
            leavingTimersRef.current[name] = setTimeout(() => pruneLeaving(name), debugMs(ms) + 60);
          }
        }
      }
    }
    lastCommittedRef.current = next;
    if (!transOpenRef.current) setStage(next);
  };

  const setQuake = (h: number, v: number, time: number) => {
    if (silentRef.current) return; // never shake during seek replay
    const key = Math.random();
    stageRef.current.quake = { h, v, key };
    commitStage();
    clearTimeout(quakeTimerRef.current);
    quakeTimerRef.current = setTimeout(() => {
      stageRef.current.quake = null;
      commitStage();
    }, Math.max(300, time));
  };

  const playBgmTrack = (stem: string | null) => {
    bgmRef.current = stem;
    setBgmStem(stem);
    if (silentRef.current) return; // seek replay: track state, make no sound
    if (stem) audio.playBgm(stem); else audio.stopBgm();
  };

  const ensureChar = (name: string): CharState => {
    const reg = resolveRegisteredName(name);
    if (!stageRef.current.chars[reg]) {
      stageRef.current.chars[reg] = {
        name: reg, visible: false, disp: 'clear', front: false,
        level: envinitRef.current?.defaultLevel ?? 1,
        xpos: 0, opacity: 255,
      };
    }
    return stageRef.current.chars[reg];
  };

  // -------------------------------------------------------------------------
  // Scenario loading
  // -------------------------------------------------------------------------

  const applyScenarioData = (name: string, data: any[], label: string | null, ptr: number | null) => {
    transOpenRef.current = false;
    clearTimeout(transitionTimerRef.current);
    setStageTransition(null);
    dataRef.current = data;
    scenarioRef.current = name;
    setCurrentScenario(name);
    setScenarioInstructions(data);
    let start = 0;
    if (ptr != null) start = ptr;
    else if (label) {
      const idx = findLabelIndex(data, label);
      if (idx >= 0) start = idx;
      else console.warn('entry label missing:', label, 'in', name);
    }
    ptrRef.current = start;
    setPointer(start);
  };

  const loadScenario = useCallback(async (
    storage: string,
    label: string | null = null,
    overridePtr: number | null = null,
    opts: { autostart?: boolean; seek?: number } = { autostart: true },
  ): Promise<boolean> => {
    const url = scenarioPath(storage);
    const res = await fetch(url);
    if (!res.ok) {
      console.error('failed to load scenario', storage, url);
      return false;
    }
    const json = await res.json();
    const name = (json.storage || storage).replace(/\.ks$/i, '');
    pendingChoicesRef.current = [];
    choiceOpenRef.current = false;
    setChoiceOptions(null);
    if (opts.seek != null) {
      // Rebuild the scene by silently replaying from the file start; the seek
      // pointer is the stop boundary handled inside runSlice.
      clearLeavingTimers();
      stageRef.current = structuredClone(EMPTY_STAGE);
      lastCommittedRef.current = structuredClone(EMPTY_STAGE);
      transOpenRef.current = false;
      clearTimeout(transitionTimerRef.current);
      setStageTransition(null);
      videoRef.current = null;
      setVideo(null);
      seekRef.current = Math.max(0, opts.seek);
      silentRef.current = true;
      setIsSeeking(true);
      speakerRef.current = '';
      setSpeaker('');
      setDialogueText('');
      setTypewriterText('');
      applyScenarioData(name, json.instructions, label, 0);
      setStage(structuredClone(stageRef.current));
    } else {
      seekRef.current = null;
      silentRef.current = false;
      setIsSeeking(false);
      applyScenarioData(name, json.instructions, label, overridePtr);
    }
    freshLineRef.current = true;
    if (opts.autostart !== false) {
      runningRef.current = false;
      void runSlice();
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Page-navigator seek inside the currently loaded scenario.
  const seekToPointer = useCallback((target: number) => {
    const data = dataRef.current;
    if (!data) return;
    runTokenRef.current++;
    runningRef.current = false;
    if (typingRef.current) { clearInterval(typingRef.current.timer); typingRef.current = null; }
    setGameState('PLAYING');
    void loadScenario(`${scenarioRef.current.split('/').pop()}.ks`, null, null, { seek: target });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadScenario]);

  const startNewGame = useCallback(() => {
    clearLeavingTimers();
    seekRef.current = null;
    silentRef.current = false;
    setIsSeeking(false);
    stageRef.current = structuredClone(EMPTY_STAGE);
    commitStage();
    setHistoryLog([]);
    historyRef.current = [];
    setF({}); fRef.current = {};
    setTf({}); tfRef.current = {};
    setSpeaker(''); speakerRef.current = '';
    setDialogueText(''); setTypewriterText('');
    setIsFastForward(false); fastRef.current = false;
    rangeSkipRef.current = false;
    setIsAutoMode(false); autoRef.current = false;
    setGameState('PLAYING');
    playBgmTrack(null);
    void loadScenario('lave01.ks');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadScenario]);

  // Shared with the script's [sysjump to="title"]: tear down the running
  // session and return to the title screen (which restarts the title BGM).
  const returnToTitle = useCallback(() => {
    runTokenRef.current++;
    runningRef.current = false;
    seekRef.current = null;
    sceneReplayRef.current = null;
    setSceneReplay(null);
    if (typingRef.current) { clearInterval(typingRef.current.timer); typingRef.current = null; }
    playBgmTrack(null);
    stageRef.current = structuredClone(EMPTY_STAGE);
    lastCommittedRef.current = structuredClone(EMPTY_STAGE);
    transOpenRef.current = false;
    clearTimeout(transitionTimerRef.current);
    setStageTransition(null);
    commitStage();
    setIsFastForward(false); fastRef.current = false;
    rangeSkipRef.current = false;
    setIsAutoMode(false); autoRef.current = false;
    choiceOpenRef.current = false;
    pendingChoicesRef.current = [];
    setChoiceOptions(null);
    setTextVisible(true); textVisibleRef.current = true;
    setSpeaker(''); speakerRef.current = '';
    setDialogueText(''); setTypewriterText('');
    setWindowHidden(false);
    videoRef.current = null;
    setVideo(null);
    setSideTab(null);
    window.history.replaceState(null, '', '#');
    setGameState('TITLE');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Begin a recollection replay: load the scene file at its memory_begin
  // label (engine scenelist.csv / scenemode.tjs semantics).
  const startSceneReplay = useCallback(async (scene: {
    storage: string; startLabel?: string; endLabel?: string; orig?: string;
  }) => {
    runTokenRef.current++;
    runningRef.current = false;
    if (typingRef.current) { clearInterval(typingRef.current.timer); typingRef.current = null; }
    clearLeavingTimers();
    seekRef.current = null;
    silentRef.current = false;
    setIsSeeking(false);
    choiceOpenRef.current = false;
    pendingChoicesRef.current = [];
    setChoiceOptions(null);
    historyRef.current = [];
    setHistoryLog([]);
    setSideTab(null);
    setWindowHidden(false);
    const marker = {
      storage: scene.storage,
      endLabel: scene.endLabel || 'memory_end',
    };
    sceneReplayRef.current = marker;
    setSceneReplay(marker);
    setGalleryViewMode('scenes');
    // Like the reference gallery (and the engine's trail flags), launching a
    // scene from the scene view unlocks it; every displayed CG tag is marked
    // as the replay progresses as well.
    markCgSeen(scene.orig);
    setGameState('PLAYING');
    const file = /\.ks$/i.test(scene.storage) ? scene.storage : `${scene.storage}.ks`;
    await loadScenario(file, scene.startLabel || 'memory_begin');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadScenario]);

  // Leave recollection (memory_end reached, or the player quits early) and
  // return to the gallery, which opens on the scene tab.
  const finishSceneReplay = useCallback(() => {
    if (!sceneReplayRef.current) return;
    runTokenRef.current++;
    runningRef.current = false;
    if (typingRef.current) { clearInterval(typingRef.current.timer); typingRef.current = null; }
    playBgmTrack(null);
    sceneReplayRef.current = null;
    setSceneReplay(null);
    seekRef.current = null;
    silentRef.current = false;
    setIsSeeking(false);
    clearLeavingTimers();
    stageRef.current = structuredClone(EMPTY_STAGE);
    lastCommittedRef.current = structuredClone(EMPTY_STAGE);
    transOpenRef.current = false;
    clearTimeout(transitionTimerRef.current);
    setStageTransition(null);
    commitStage();
    choiceOpenRef.current = false;
    pendingChoicesRef.current = [];
    setChoiceOptions(null);
    videoRef.current = null;
    setVideo(null);
    setSpeaker(''); speakerRef.current = '';
    setDialogueText(''); setTypewriterText('');
    historyRef.current = [];
    setHistoryLog([]);
    setSideTab(null);
    window.history.replaceState(null, '', '#');
    setGameState('GALLERY');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  finishSceneReplayRef.current = finishSceneReplay;

  // -------------------------------------------------------------------------
  // Command handling
  // -------------------------------------------------------------------------

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const handleCharacterTag = (name: string, args: Record<string, any>, argv: string[]) => {
    const hasVisualTokens = argv.some(t => {
      const k = classifyToken(name, t);
      return k !== 'transition' && k !== 'action' && k !== 'flag' && k !== 'unknown';
    });
    if (args.voice) {
      voiceRef.current = args.voice;
      if (!silentRef.current) audio.playVoice(args.voice);
      setCurrentVoice(args.voice);
    }
    if (!hasVisualTokens && argv.length === 0) return; // voice/nameplate only
    if (!hasVisualTokens) return; // transition-only action

    const ch = ensureChar(name);
    const wasVisible = ch.visible;
    let touched = false;
    let explicitDisp: CharDisp | null = null;
    for (const tok of argv) {
      const kind = classifyToken(name, tok);
      switch (kind) {
        case 'pose':
          ch.pose = tok; touched = true; break;
        case 'dress':
          ch.dress = tok; touched = true; break;
        case 'diff':
          ch.diff = tok; touched = true; break;
        case 'face':
          ch.face = tok; touched = true; break;
        case 'xpos': {
          const p = envinitRef.current?.positions[tok];
          if (p?.xpos != null) ch.xpos = p.xpos;
          touched = true;
          break;
        }
        case 'level': {
          const p = envinitRef.current?.positions[tok];
          if (p?.level != null) ch.level = p.level;
          else if (tok === '手前') ch.level = 2;
          else if (tok === '奥') ch.level = 0;
          else if (tok === '前') ch.level = 1;
          touched = true;
          break;
        }
        case 'show':
          explicitDisp = 'both'; touched = true; break;
        case 'faceDisp':
          explicitDisp = 'face'; touched = true; break;
        case 'hideClear':
          explicitDisp = 'clear'; touched = true; break;
        case 'hideInvisible':
          explicitDisp = 'invisible'; touched = true; break;
        case 'front':
          ch.front = tok === 'front'; touched = true; break;
        default:
          break;
      }
    }
    if (args.opacity != null) ch.opacity = parseInt(String(args.opacity), 10) || 0;
    if (args.xpos != null) ch.xpos = parseInt(String(args.xpos), 10) || 0;
    if (!ch.diff) ch.diff = '基本';
    ch.disp = resolveCharDisp(ch.disp, explicitDisp, touched);
    ch.visible = charBodyVisible(ch.disp);

    // Named per-layer transition (スライド出/消 etc.): drives a slide/fade
    // in the view. Suppressed during seek replay / fast forward (engine
    // zeroes transition times while skipping).
    const instant = fastRef.current || seekRef.current != null || silentRef.current;
    if (!instant && touched && wasVisible !== ch.visible) {
      const transTok = [...argv].reverse().find(t => classifyToken(name, t) === 'transition');
      const def = transTok ? envinitRef.current?.transitions?.[transTok] : undefined;
      const argTime = args.time != null ? parseInt(String(args.time), 10) : NaN;
      const ms = Math.max(0, Math.min(2000, Number.isFinite(argTime) ? argTime : (def?.time ?? 300)));
      const nonce = ++animNonceRef.current;
      if (ch.visible) {
        const spec = (def as any)?.showaction?.left?.start;
        ch.enterAnim = { dx: parseMoveRel(spec), ms, nonce };
        delete ch.exitAnim;
      } else {
        const spec = (def as any)?.hideaction?.left?.value;
        ch.exitAnim = { dx: parseMoveRel(spec), ms, nonce };
        delete ch.enterAnim;
      }
    }
  };

  const upsertLayer = (key: string, init: Partial<DynLayer>): DynLayer => {
    if (!stageRef.current.layers[key]) {
      stageRef.current.layers[key] = {
        name: key, visible: true, front: false, level: 5,
        xpos: null, ypos: null, opacity: 255, afx: 'center', afy: 'center',
        orx: null, ory: null,
        ...init,
      };
    }
    return stageRef.current.layers[key];
  };

  const applyLayerArgs = (ly: DynLayer, args: Record<string, any>, argv: string[]) => {
    const prev = { x: ly.xpos, y: ly.ypos, opacity: ly.opacity };
    if (args.file) ly.file = args.file;
    if (args.level != null) ly.level = parseInt(String(args.level), 10) || ly.level;
    if (args.xpos != null) ly.xpos = parseInt(String(args.xpos), 10);
    if (args.ypos != null) ly.ypos = parseInt(String(args.ypos), 10);
    if (args.opacity != null) ly.opacity = parseInt(String(args.opacity), 10) || 0;
    // Registration point: origin= (1–9) sets afx/afy (image fraction),
    // vorigin= sets orx/ory (view origin in stage px); explicit words win.
    if (args.origin != null) {
      const o = originModeToAfAf(args.origin);
      ly.afx = o.afx; ly.afy = o.afy;
    }
    if (args.afx === 'left' || args.afx === 'center' || args.afx === 'right') ly.afx = args.afx;
    if (args.afy === 'top' || args.afy === 'center' || args.afy === 'bottom') ly.afy = args.afy;
    if (args.vorigin != null) {
      const o = originModeToViewPx(args.vorigin);
      ly.orx = o.orx; ly.ory = o.ory;
    }
    {
      const ox = originParamPx(args.orx, 'x');
      if (ox != null) ly.orx = ox;
      const oy = originParamPx(args.ory, 'y');
      if (oy != null) ly.ory = oy;
    }
    if (argv.includes('show')) ly.visible = true;
    if (argv.includes('hide')) ly.visible = false;
    if (argv.includes('front')) ly.front = true;
    if (argv.includes('back')) ly.front = false;
    if (!ly.file && args.storage) ly.file = args.storage;

    // Large-art pans/fades carry time=: tween the changed properties
    // ([ev opacity=255 time=1500], [scrl ypos=150 time=1000 accel=-1]).
    // Zero duration while skipping/seeking; a file swap or a new position
    // without time cuts and cancels any running pan. Separate tracks let a
    // fade and a pan issued back-to-back overlap (same layer, two WAAPI anims).
    const instant = fastRef.current || seekRef.current != null || silentRef.current;
    const msArg = args.time != null && args.time !== '' ? parseInt(String(args.time), 10) : 0;
    const hasPos = args.xpos != null || args.ypos != null;
    const hasOp = args.opacity != null;
    if (!instant && msArg > 0 && (hasPos || hasOp)) {
      const drawFactor = Math.max(0, Math.min(2, 2 - (sfRef.current.drawPos ?? 120) / 120 * 1));
      const ms = Math.round(debugMs(msArg) * drawFactor);
      const accel = parseInt(String(args.accel ?? '0'), 10) || 0;
      const easing = accel < 0 ? 'ease-out' : accel > 0 ? 'ease-in' : 'linear';
      const tracks: LayerAnim = hasPos
        ? { ...ly.anim, pos: {
            nonce: ++animNonceRef.current, ms, easing,
            from: { x: prev.x ?? 400, y: prev.y ?? 300 },
            to: { x: ly.xpos ?? 400, y: ly.ypos ?? 300 },
          } }
        : { ...ly.anim };
      if (hasOp) tracks.op = {
        nonce: ++animNonceRef.current, ms, easing,
        from: prev.opacity, to: ly.opacity,
      };
      ly.anim = tracks;
    } else if (args.file || hasPos || hasOp) {
      delete ly.anim;
    }
  };

  // Block the script on sync pans: `sync` waits for the full tween,
  // `transwait=` caps the wait (motion continues under the next lines);
  // nowait/nosync return immediately.
  const waitForLayerMotion = async (ly: DynLayer, args: Record<string, any>, argv: string[]) => {
    const skipping = fastRef.current || seekRef.current != null || silentRef.current;
    if (skipping) return;
    const msArg = args.time != null && args.time !== '' ? parseInt(String(args.time), 10) : 0;
    if (!(msArg > 0)) return;
    const drawFactor = Math.max(0, Math.min(2, 2 - (sfRef.current.drawPos ?? 120) / 120 * 1));
    const ms = Math.round(debugMs(msArg) * drawFactor);
    let wait = 0;
    if (argv.includes('sync')) wait = ms;
    else if (args.transwait != null && args.transwait !== '' && !argv.includes('nowait')
             && !argv.includes('nosync')) {
      wait = Math.min(ms, parseInt(String(args.transwait), 10) || 0);
    }
    if (wait > 0) await sleep(wait);
  };

  const isStageTag = (n: string) => !!envinitRef.current?.stages[n];
  const isCharTag = (n: string) => {
    const env = envinitRef.current;
    if (!env) return false;
    if (env.characters[n]) return true;
    if (stageRef.current.chars[resolveRegisteredName(n)]) return true;
    if (stageRef.current.layers[n]) return true;
    return Object.values(env.characters).some((d: any) => d.nameAlias === n);
  };

  /** Returns false when the slice should stop for a jump/load failure. */
  const handleCommand = async (inst: any): Promise<'continue' | 'stop' | 'jump'> => {
    const name: string = inst.name;
    // Expand &-expression attributes once, before any handler runs.
    const rawArgs: Record<string, any> = inst.args || {};
    const args: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawArgs)) {
      args[k] = expandKagArg(v, fRef.current, sfRef.current, tfRef.current, skipModeNum());
    }
    const rawArgv: string[] = inst.argv || [];
    const argv: string[] = rawArgv.map(a => {
      const v = expandKagArg(a, fRef.current, sfRef.current, tfRef.current, skipModeNum());
      return v == null ? a : String(v);
    });
    const lname = name.toLowerCase();
    const world = stageRef.current;

    // ---- flow control ----
    if (name === 'next') {
      if (args.eval && !sandboxEval(args.eval, fRef.current, sfRef.current, tfRef.current, skipModeNum(), !!sceneReplayRef.current)) {
        return 'continue';
      }
      if (args.storage) {
        const ok = await loadScenario(String(args.storage), args.target ? String(args.target) : null, null, { autostart: false });
        if (!ok) return 'continue';
      }
      else if (args.target) {
        if (!jumpToLabel(String(args.target))) return 'continue';
      }
      return 'jump';
    }
    if (name === 'fastskip' && args.target) {
      // Acceleration marker: only warps while the player is actively skipping.
      if (!fastRef.current) return 'continue';
      if (args.storage) {
        const ok = await loadScenario(String(args.storage), String(args.target), null, { autostart: false });
        return ok ? 'jump' : 'continue';
      }
      return jumpToLabel(String(args.target)) ? 'jump' : 'continue';
    }
    if (name === 'gotostart') {
      const ok = await loadScenario('start.ks', null, null, { autostart: false });
      return ok ? 'jump' : 'continue';
    }
    if (name === 'eval') {
      sandboxExec(String(inst.exp || ''));
      return 'continue';
    }
    if (name === 'seladd') {
      if (!args.cond || sandboxEval(args.cond, fRef.current, sfRef.current, tfRef.current, skipModeNum())) {
        pendingChoicesRef.current.push({
          text: String(args.text || ''),
          target: String(args.target || ''),
          storage: args.storage,
          exp: args.exp != null ? String(args.exp) : undefined,
        });
      }
      return 'continue';
    }
    if (name === 'select') {
      choiceOpenRef.current = true;
      setChoiceOptions([...pendingChoicesRef.current]);
      return 'stop';
    }

    // ---- stages / background ----
    if (isStageTag(name)) {
      let time = world.bg?.time || envinitRef.current?.defaultTime || '昼';
      for (const t of argv) if (envinitRef.current?.times[t]) time = t;
      if (args.stime && envinitRef.current?.times[args.stime]) time = args.stime;
      world.bg = { stem: stageStem(name, time), time };
      // A new stage resets the camera, but the stage tag itself may carry
      // initial camera values (e.g. [通学路 昼 xpos=-150 ypos=-150]).
      const eff: BgEffect = {};
      for (const k of BG_CAM_KEYS) {
        if (args[k] != null && args[k] !== '') eff[k] = parseFloat(String(args[k]));
      }
      world.bgEffect = eff;
      world.bgHidden = false;
      markBgSeen(world.bg.stem);
      commitStage();
      return 'continue';
    }
    if (name === 'stime') {
      const t = argv[0] || args.time;
      if (t && envinitRef.current?.times[t] && world.bg) world.bg = { ...world.bg, time: t };
      return 'continue';
    }
    // ---- transitions: buffer visual changes, commit atomically at end ----
    if (name === 'begintrans') { transOpenRef.current = true; return 'continue'; }
    if (name === 'endtrans') {
      transOpenRef.current = false;
      const method = String(args.trans ?? '');
      const rawWait = args.transwait != null && args.transwait !== '' ? args.transwait : args.time;
      const waitMs = rawWait != null && rawWait !== '' ? (parseInt(String(rawWait), 10) || 0) : 0;
      const skipping = fastRef.current || rangeSkipRef.current || seekRef.current != null;
      // No method (or explicit notrans): atomic cut.
      if (!method || method === 'notrans') {
        commitStage();
        if (waitMs && !skipping) await sleep(debugMs(waitMs));
        return 'continue';
      }
      const anim = transAnim(method);
      // エフェクト速度 slider (drawPos 0..255): 120 = normal (1x),
      // 0 = slow (2x duration), 255 = instant (0x). Matches the engine's
      // drawspeed = (100-pos)/50 curve over the 0..200 slider range.
      const drawFactor = Math.max(0, Math.min(2, 2 - (sfRef.current.drawPos ?? 120) / 120 * 1));
      const ms = Math.round(debugMs(waitMs || anim.ms) * drawFactor);
      const old = lastCommittedRef.current;
      commitStage(true); // reveal the new scene underneath
      if (!skipping) {
        setStageTransition({ old, cls: anim.cls, ms, key: ++transKeyRef.current });
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = setTimeout(() => setStageTransition(null), ms + 80);
      }
      if (waitMs && !skipping) await sleep(ms);
      return 'continue';
    }

    if (name === 'bg') {
      const stem = args.file || args.storage || args.str;
      if (stem) {
        world.bg = { stem: String(stem).replace(/\.\w+$/, ''), time: world.bg?.time || '昼' };
        const eff: BgEffect = {};
        for (const k of BG_CAM_KEYS) {
          if (args[k] != null && args[k] !== '') eff[k] = parseFloat(String(args[k]));
        }
        world.bgEffect = eff;
        world.bgHidden = false;
      } else {
        // Background camera / filter control (never sets an image).
        const eff: BgEffect = argv.includes('resetcamera') ? {} : { ...world.bgEffect };
        for (const k of BG_CAM_KEYS) {
          if (args[k] != null && args[k] !== '') eff[k] = parseFloat(String(args[k]));
        }
        world.bgEffect = eff;
      }
      commitStage();
      return 'continue';
    }
    if (name === 'hidebase') { world.bgHidden = true; commitStage(); return 'continue'; }
    if (name === 'env') {
      const adj: EnvAdjust = { ...world.envAdjust };
      if (args.grayscale === 'true') adj.grayscale = true;
      if (args.grayscale === 'false') delete adj.grayscale;
      for (const k of ['rgamma', 'ggamma', 'bgamma'] as const) {
        if (args[k] != null) adj[k] = parseFloat(String(args[k]));
      }
      world.envAdjust = adj;
      commitStage();
      return 'continue';
    }
    if (name === 'colorall' || name === 'resetcolor') {
      if (argv.includes('reset') || name === 'resetcolor') world.envAdjust = {};
      commitStage();
      return 'continue';
    }

    // ---- events / dynamic layers ----
    if (name === 'ev') {
      // The framework keeps ONE event layer; both [ev file=base] and
      // [ev file=..._l] address it (large art is just a positioned file used
      // for pans). Bare [ev opacity=..]/[ev xpos=..] tags adjust the current
      // file. Loading a different file resets pan alignment unless the tag
      // itself supplies a new position.
      const slot = '__event__';
      const ly = upsertLayer(slot, { front: true, level: 6 });
      if (args.file) {
        const nextFile = String(args.file).replace(/\.\w+$/, '');
        if (nextFile !== ly.file) {
          ly.file = nextFile;
          if (args.xpos == null) ly.xpos = null;
          if (args.ypos == null) ly.ypos = null;
          if (args.origin == null && args.afx == null) ly.afx = 'center';
          if (args.origin == null && args.afy == null) ly.afy = 'center';
          if (args.vorigin == null && args.orx == null) ly.orx = null;
          if (args.vorigin == null && args.ory == null) ly.ory = null;
        }
      }
      applyLayerArgs(ly, args, argv);
      if (argv.includes('hide') || args.visible === 'false') ly.visible = false;
      else if (argv.includes('show')) ly.visible = true;
      if (ly.file && /^ev/.test(ly.file)) markCgSeen(ly.file);
      commitStage();
      await waitForLayerMotion(ly, args, argv);
      return 'continue';
    }
    if (name === 'newlay' || name === 'newlayer' || name === 'new') {
      const key = String(args.name || '');
      if (key) {
        const ly = upsertLayer(key, {});
        applyLayerArgs(ly, args, argv);
        if (args.opacity === '0') ly.visible = ly.visible && argv.includes('show');
        if (ly.file && /^ev/.test(ly.file)) markCgSeen(ly.file);
        commitStage();
        await waitForLayerMotion(ly, args, argv);
      }
      return 'continue';
    }
    if (name === 'dellay') {
      if (args.name) delete world.layers[String(args.name)];
      commitStage();
      return 'continue';
    }
    if (/^ev[_]/i.test(name) && mediaUrl(name)) {
      // Shorthand for [ev file=<name>]: the single event layer swaps its
      // artwork, so a base CG and its positioned "_l" pan art replace each
      // other rather than stacking (transient overlays use [newlay]).
      // Every tag re-shows the slot (tags after hideall/transitions restore
      // visibility); an explicit opacity=0 is a transparent preload.
      const ly = upsertLayer('__event__', { front: true, level: 6 });
      if (ly.file !== name) {
        ly.file = name;
        // New artwork resets pan alignment unless this tag repositions it.
        if (args.xpos == null) ly.xpos = null;
        if (args.ypos == null) ly.ypos = null;
        ly.afx = 'center'; ly.afy = 'center';
        ly.orx = null; ly.ory = null;
      }
      applyLayerArgs(ly, args, argv);
      if (!argv.includes('hide') && args.visible !== 'false') ly.visible = true;
      markCgSeen(name);
      commitStage();
      await waitForLayerMotion(ly, args, argv);
      return 'continue';
    }
    if (world.layers[name]) {
      const ly = world.layers[name];
      applyLayerArgs(ly, args, argv);
      commitStage();
      await waitForLayerMotion(ly, args, argv);
      return 'continue';
    }

    // ---- characters ----
    if (name === 'newchar') {
      // Runtime character alias (e.g. アキナの姉 inherits アキナ's art/voice).
      const env = envinitRef.current;
      if (env && args.name && args.initname) {
        env.characters[String(args.name)] = {
          ...(env.characters[String(args.initname)] || {}),
          nameAlias: String(args.initname),
        };
      }
      return 'continue';
    }
    if (isCharTag(name)) {
      handleCharacterTag(name, args, argv);
      commitStage();
      return 'continue';
    }

    // ---- visibility groups ----
    if (name === 'hideall' || name === 'hidechars' || name === 'allchar') {
      const hide = name === 'hideall' || name === 'hidechars' || argv.includes('hide');
      if (hide) {
        for (const ch of Object.values(world.chars)) {
          if (name === 'allchar') {
            // Engine re-emits the tag only to body-showing chars; FACE busts
            // and already-hidden chars are left untouched.
            const next = allcharHideDisp(ch.disp);
            if (next) ch.disp = next;
          } else {
            ch.disp = 'clear';
          }
          ch.visible = false;
        }
      }
      if (name === 'hideall') for (const ly of Object.values(world.layers)) ly.visible = false;
      commitStage();
      return 'continue';
    }
    if (name === 'hidelayers' || name === 'alllayer') {
      const hide = name === 'hidelayers' || argv.includes('hide');
      for (const ly of Object.values(world.layers)) ly.visible = !hide;
      commitStage();
      return 'continue';
    }
    if (name === 'hideevent') {
      for (const ly of Object.values(world.layers)) if (ly.file && /^ev|black|white/.test(ly.file)) ly.visible = false;
      if (world.layers.__event__) world.layers.__event__.visible = false;
      commitStage();
      return 'continue';
    }
    if (name === 'clearlayers') {
      world.layers = {};
      world.chars = {};
      commitStage();
      return 'continue';
    }

    // ---- audio ----
    if (name === 'bgm') {
      // Cues appear as [bgm storage=..], [bgm play=bgm28], the positional
      // [bgm bgm02] form, or [bgm stop=2000] / [bgm stop] / [bgm wait].
      const cueRef = args.storage || args.file || args.name || args.play
        || argv.find((a: string) => /^bgm\d/i.test(a));
      if (args.stop != null || argv.includes('stop') || args.fadeout != null) playBgmTrack(null);
      else if (cueRef) {
        const stem = String(cueRef).replace(/\.\w+$/, '');
        playBgmTrack(stem);
        setSf((p: any) => ({ ...p, bgmSeen: { ...(p.bgmSeen || {}), [stem]: true } }));
      }
      return 'continue';
    }
    if (/^bgm/i.test(name)) {
      playBgmTrack(name);
      setSf((p: any) => ({ ...p, bgmSeen: { ...(p.bgmSeen || {}), [name]: true } }));
      return 'continue';
    }
    if (name === 'stopbgm' || name === 'fadeoutbgm' || name === 'allstop' || name === 'stopallsound') {
      playBgmTrack(null);
      return 'continue';
    }
    const seRef = name === 'se' ? (args.name || args.storage || args.file) : null;
    if (name === 'se' && (args.stop != null || argv.includes('stop'))) return 'continue';
    if (seRef || /^se[0-9_]/i.test(name)) {
      const stem = String(seRef || name);
      if (mediaUrl(stem) && !silentRef.current) audio.playSe(stem);
      return 'continue';
    }
    if (name === 'allse' && argv.includes('stop')) return 'continue';
    if (name === 'stopallvoice') { audio.stopVoice(); return 'continue'; }

    // ---- message window ----
    if (name === 'msgoff') { textVisibleRef.current = false; setTextVisible(false); return 'continue'; }
    if (name === 'msgon') { textVisibleRef.current = true; setTextVisible(true); return 'continue'; }

    // ---- effects / timing ----
    if (name === 'quake') {
      setQuake(parseInt(args.hmax || '5', 10), parseInt(args.vmax || '5', 10), parseInt(args.time || '600', 10));
      return 'continue';
    }
    if (name === 'stopquake') {
      world.quake = null; commitStage(); return 'continue';
    }
    if (name === 'wait') {
      if (seekRef.current == null) {
        const t = parseInt(args.time || '200', 10);
        if (fastRef.current) await sleep(30);
        else await sleep(Math.min(t, 4000));
      }
      return 'continue';
    }
    if (name === 'waitclick' || name === 'waitvolume') {
      if (seekRef.current != null) return 'continue'; // replay runs straight through
      // inline click wait
      waitingRef.current = true;
      setIsWaiting(true);
      return 'stop';
    }

    // ---- video ----
    if (name === 'sysmovie') {
      if (args.state === 'end' || (!args.storage && argv.length === 0)) {
        videoRef.current = null;
        setVideo(null);
        return 'continue';
      }
      if (args.storage) {
        // Debug seek is a silent replay: never play the movie.
        if (seekRef.current != null) return 'continue';
        // Engine semantics: the movie macro issues [cancelskip] first, so
        // fast-forward / range-skip reaching the OP is released and the
        // movie plays. A direct click on the movie itself still skips it
        // (advance -> endVideo).
        if (fastRef.current || rangeSkipRef.current) {
          fastRef.current = false;
          rangeSkipRef.current = false;
          setIsFastForward(false);
        }
        setIsAutoMode(false); autoRef.current = false;
        playBgmTrack(null); // the movie carries its own audio
        const v = { stem: String(args.storage) };
        videoRef.current = v;
        setVideo(v);
        return 'stop';
      }
    }
    if (name === 'stopvideo') {
      videoRef.current = null;
      setVideo(null);
      return 'continue';
    }

    // ---- chapter intermission ----
    // The authentic chapter card is the ef_syoutitle_* full-screen layer
    // shown by the 章タイトル macros in-scenario; these control tags need
    // no standalone UI on our side.
    if (name === 'intermission' || name === 'chaptitle') return 'continue';

    // ---- system navigation ----
    if (name === 'sysjump' && String(args.to || '') === 'title') {
      returnToTitle();
      return 'stop';
    }
    if (name === 'cancelautomode') {
      setIsAutoMode(false);
      autoRef.current = false;
      return 'continue';
    }

    // ---- skip control ----
    // beginskip/endskip bracket a range that may be fast-skipped; they do not
    // toggle skip mode by themselves.
    if (name === 'beginskip') { rangeSkipRef.current = true; return 'continue'; }
    if (name === 'endskip') { rangeSkipRef.current = false; return 'continue'; }
    if (name === 'cancelskip') { rangeSkipRef.current = false; return 'continue'; }

    // ---- intentionally-handled no-ops ----
    if ([
      'sysuiload', 'meswinload', 'position', 'bubble', 'wbl', 'sysupdate', 'sysjump',
      'locklink', 'unlocklink', 'clickskip', 'swpermitskip', 'camera', 'shifty', 'shiftx',
      'camerax', 'cameray', 'camerazoom', 'actioncamera', 'resetcamera', 'stopcamera',
      'camerach', 'sysrclick', 'linemode', 'erafterpage', 'noeffect', 'nowaitmode',
      'cancelnowaitmode', 'autodisplay', 'autohide', 'history', 'historyopt',
      'clearhistory', 'cursor', 'defaultcursor', 'nostopbgm', 'keepvoice',
    ].includes(lname)) {
      return 'continue';
    }

    // Unknown commands do not halt the game.
    if (!['r', 'p', 'l', 'np'].includes(name)) {
      // silently ignore (system-screen / UI commands)
    }
    return 'continue';
  };

  const skipModeNum = () => (fastRef.current ? 1 : 0);

  const sandboxExec = (exp: string) => {
    const cleaned = String(exp).replace(/^&@?/, '').trim();
    try {
      const fn = new Function(
        'f', 'sf', 'tf', 'kag', 'mp', ...Object.keys(KAG_CONSTS),
        `"use strict"; ${cleaned}; return { f, sf, tf };`,
      );
      const r = fn(
        fRef.current, sfRef.current, tfRef.current,
        { skipMode: skipModeNum(), isRecollection: !!sceneReplayRef.current }, {},
        ...Object.values(KAG_CONSTS),
      );
      fRef.current = r.f; sfRef.current = r.sf; tfRef.current = r.tf;
      setF({ ...r.f }); setSfState({ ...r.sf }); setTf({ ...r.tf });
    } catch (e) {
      console.warn('exec failed:', exp, e);
    }
  };

  const jumpToLabel = (target: string): boolean => {
    const data = dataRef.current;
    if (!data) return false;
    // A jump out of an unterminated trans block commits its pending visuals.
    if (transOpenRef.current) {
      transOpenRef.current = false;
      commitStage();
    }
    const idx = findLabelIndex(data, target);
    if (idx < 0) {
      console.warn('label not found:', target, 'in', scenarioRef.current);
      return false;
    }
    ptrRef.current = idx;
    setPointer(idx);
    return true;
  };

  const markCgSeen = (file: string) => {
    const key = String(file);
    setSf((p: any) => ({ ...p, cgSeen: { ...(p.cgSeen || {}), [key]: true } }));
  };
  const markBgSeen = (stem: string) => {
    setSf((p: any) => ({ ...p, cgSeen: { ...(p.cgSeen || {}), [`bg:${stem}`]: true } }));
  };

  // -------------------------------------------------------------------------
  // Interpreter slice
  // -------------------------------------------------------------------------

  const typewriter = (full: string, done: () => void, prefix = '') => {
    if (fastRef.current) {
      setTypewriterText(full);
      done();
      return;
    }
    let i = prefix.length;
    // Mid-line [*] continuations keep the already-revealed prefix visible.
    setTypewriterText(full.slice(0, i));
    // メッセージ速度 slider (config textPos 0..255) → chars/tick; legacy
    // textSpeed (1..8) honored for old saves.
    const speed = sfRef.current.textPos != null
      ? 1 + Math.round((sfRef.current.textPos / 255) * 9)
      : (sfRef.current.textSpeed ?? 2);
    const timer = setInterval(() => {
      i += speed;
      setTypewriterText(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(timer);
        typingRef.current = null;
        done();
      }
    }, 24);
    typingRef.current = { full, timer };
  };

  const finishTyping = () => {
    if (typingRef.current) {
      clearInterval(typingRef.current.timer);
      setTypewriterText(typingRef.current.full);
      typingRef.current = null;
    }
  };

  const trailRef = useRef<Array<[string, number, string]>>([]);

  // Does the instruction at `p` belong to the SAME displayed page? True for a
  // mid-line [*] tap point: either an inline wait still ahead of the text, or
  // a text node sitting directly behind one.
  const pageContinues = (p: number): boolean => {
    const data = dataRef.current;
    if (!data) return false;
    let i = p;
    while (data[i]?.type === 'line_feed') i++;
    if (data[i]?.type === 'wait_click') return true;
    if (data[i]?.type === 'text') {
      let j = p - 1;
      while (j >= 0 && data[j]?.type === 'line_feed') j--;
      const prev = data[j];
      if (prev?.type === 'wait_click' && prev.inline) return true;
    }
    return false;
  };
  const pageContinuesRef = useRef(pageContinues);
  pageContinuesRef.current = pageContinues;

  const finishSeek = () => {
    seekRef.current = null;
    silentRef.current = false;
    setIsSeeking(false);
    // A seek can land on the second half of a [*]-split line: keep the page
    // open so the next click appends instead of replacing the shown text.
    freshLineRef.current = !pageContinues(ptrRef.current);
    // A seek boundary inside an open trans block: reveal the draft as a cut.
    if (transOpenRef.current) {
      transOpenRef.current = false;
      clearTimeout(transitionTimerRef.current);
      setStageTransition(null);
    }
    commitStage();
    waitingRef.current = true;
    setIsWaiting(true);
    if (bgmRef.current) audio.playBgm(bgmRef.current); else audio.stopBgm();
  };

  const runSlice = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    const myToken = ++runTokenRef.current;
    let budget = 200000; // command watchdog: a single slice must not spin forever
    try {
      while (true) {
        if (myToken !== runTokenRef.current) break;
        const data = dataRef.current;
        if (!data) break;
        if (seekRef.current != null && ptrRef.current >= seekRef.current) {
          finishSeek();
          break;
        }
        if (ptrRef.current >= data.length) break;
        if (seekRef.current == null && choiceOpenRef.current) break;
        if (--budget <= 0) {
          console.error('runSlice watchdog tripped', {
            scenario: scenarioRef.current,
            pointer: ptrRef.current,
            inst: data[ptrRef.current],
            trail: trailRef.current.slice(-24),
          });
          break;
        }

        const inst = data[ptrRef.current];
        if (inst?.type === 'command') {
          const trail = trailRef.current;
          trail.push([scenarioRef.current, ptrRef.current, String(inst.name)]);
          if (trail.length > 40) trail.shift();
        }

        if (inst.type === 'label' || inst.type === 'comment') {
          if (inst.type === 'label' && sceneReplayRef.current &&
              inst.name === sceneReplayRef.current.endLabel) {
            finishSceneReplayRef.current();
            break;
          }
          ptrRef.current++; continue;
        }
        if (inst.type === 'line_feed') { ptrRef.current++; continue; }
        if (inst.type === 'page_break' || inst.type === 'clear_text') {
          freshLineRef.current = true;
          ptrRef.current++;
          continue;
        }
        if (inst.type === 'text') {
          const raw = String(inst.text_jp || inst.text || '');
          if (seekRef.current != null) {
            // Silent replay: refresh the shown line, but never wait/type/history.
            const mm = raw.match(/^【([^】]+)】(.*)$/s);
            if (mm || freshLineRef.current) {
              const plate = (s: string) => { const i = s.indexOf('/'); return i >= 0 ? s.slice(i + 1) : s; };
              speakerRef.current = mm ? plate(mm[1]) : '';
              setSpeaker(speakerRef.current);
              textVisibleRef.current = true;
              setTextVisible(true);
            }
            const next = mm ? mm[2] : dialogueRef.current + raw;
            dialogueRef.current = next;
            setDialogueText(next);
            setTypewriterText(next);
            voiceRef.current = '';
            ptrRef.current++;
            setPointer(ptrRef.current);
            continue;
          }
          // nameplate from leading 【name】; 【key/表示名】 shows only the
          // display override after the slash (used for ？？？ before reveals).
          const plateName = (s: string) => { const i = s.indexOf('/'); return i >= 0 ? s.slice(i + 1) : s; };
          const m = raw.match(/^【([^】]+)】(.*)$/s);
          let body = raw;
          if (m) {
            speakerRef.current = plateName(m[1]);
            setSpeaker(speakerRef.current);
            body = m[2];
          }
          let prefix = '';
          if (freshLineRef.current) {
            // Spoken lines always carry a 【name】 prefix; narration clears it.
            speakerRef.current = m ? plateName(m[1]) : '';
            setSpeaker(speakerRef.current);
            // The framework hides the window with msgoff before transitions
            // and implicitly reopens it when the next line starts.
            textVisibleRef.current = true;
            setTextVisible(true);
            dialogueRef.current = body;
            setDialogueText(body);
            historyRef.current.push({
              speaker: speakerRef.current,
              text: body,
              voice: voiceRef.current,
              scenario: scenarioRef.current,
              pointer: ptrRef.current,
            });
            setHistoryLog([...historyRef.current]);
            markRead(ptrRef.current);
          } else {
            // Same-page continuation ([*] inline wait): append, keeping the
            // revealed prefix; history grows the same single entry. A seek
            // can land on the continuation without having pushed one — in
            // that case backfill the entry here.
            prefix = dialogueRef.current;
            const next = prefix + body;
            dialogueRef.current = next;
            setDialogueText(next);
            const last = historyRef.current[historyRef.current.length - 1];
            if (last) {
              last.text = next;
            } else {
              historyRef.current.push({
                speaker: speakerRef.current,
                text: next,
                voice: voiceRef.current,
                scenario: scenarioRef.current,
                pointer: ptrRef.current,
              });
              markRead(ptrRef.current);
            }
            setHistoryLog([...historyRef.current]);
          }
          ptrRef.current++;
          setPointer(ptrRef.current);
          waitingRef.current = true;
          setIsWaiting(true);
          const stopToken = myToken;
          const full = freshLineRef.current ? body : dialogueRef.current;
          const revealed = freshLineRef.current ? '' : prefix;
          typewriter(full,
            () => { if (stopToken === runTokenRef.current) { /* idle on click */ } },
            revealed);
          break;
        }
        if (inst.type === 'wait_click') {
          freshLineRef.current = false;
          ptrRef.current++;
          setPointer(ptrRef.current);
          // Mid-line [*]: the preceding text node already provided the
          // click pause — continue on the SAME page without another wait.
          if (inst.inline) continue;
          if (seekRef.current != null) continue;
          waitingRef.current = true;
          setIsWaiting(true);
          break;
        }
        if (inst.type === 'eval') {
          sandboxExec(String(inst.exp || ''));
          ptrRef.current++;
          setPointer(ptrRef.current);
          continue;
        }
        if (inst.type !== 'command') { ptrRef.current++; continue; }

        const outcome = await handleCommand(inst);
        if (myToken !== runTokenRef.current) break;
        if (outcome === 'jump') {
          // new scenario loaded; continue interpreting (a cross-file jump
          // during a seek clears the seek and plays normally from there)
          // A recollection must never spill past its scene file.
          const rep = sceneReplayRef.current;
          if (rep && scenarioRef.current.split('/').pop() !== rep.storage) {
            finishSceneReplayRef.current();
            break;
          }
          continue;
        }
        if (seekRef.current != null && outcome === 'stop') {
          if (choiceOpenRef.current) {
            // Auto-follow the first available branch during replay.
            const opts = pendingChoicesRef.current;
            pendingChoicesRef.current = [];
            choiceOpenRef.current = false;
            setChoiceOptions(null);
            const opt = opts[0];
            if (opt?.exp) sandboxExec(opt.exp);
            let moved = false;
            if (opt?.storage && opt.target.includes('|')) {
              const [s, l] = opt.target.split('|');
              await loadScenario(s || opt.storage, l);
              moved = true;
            } else if (opt?.storage) {
              await loadScenario(opt.storage, opt.target);
              moved = true;
            } else if (opt?.target) {
              moved = jumpToLabel(opt.target);
            }
            // An exp-only branch leaves pointer at [select]; step past it.
            if (!moved) {
              ptrRef.current++;
              setPointer(ptrRef.current);
            }
            continue;
          }
          // Timed waits / click waits / movies are skipped while seeking.
          ptrRef.current++;
          setPointer(ptrRef.current);
          continue;
        }
        ptrRef.current++;
        setPointer(ptrRef.current);
        if (outcome === 'stop') break;
      }
    } finally {
      runningRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = (ptr: number) => {
    const rs = sfRef.current.readScenarios || {};
    const perScenario = rs[scenarioRef.current] || {};
    perScenario[ptr] = true;
    setSf((p: any) => ({ ...p, readScenarios: { ...rs, [scenarioRef.current]: perScenario } }));
  };

  const isRead = (ptr: number) =>
    !!sfRef.current.readScenarios?.[scenarioRef.current]?.[ptr];

  // -------------------------------------------------------------------------
  // Player input
  // -------------------------------------------------------------------------

  const endVideo = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current = null;
    setVideo(null);
    waitingRef.current = false;
    setIsWaiting(false);
    const data = dataRef.current;
    if (data && ptrRef.current < data.length) {
      ptrRef.current++;
      setPointer(ptrRef.current);
    }
    void runSlice();
  }, [runSlice]);

  // dialog.csv Yes/No confirmation used for save/load/title/reset asks.
  const requestConfirm = useCallback((kind: string): Promise<boolean> => {
    if (askResolverRef.current) {
      askResolverRef.current(false);
      askResolverRef.current = null;
    }
    return new Promise<boolean>(resolve => {
      askResolverRef.current = resolve;
      askOpenRef.current = true;
      setAskDialog(kind);
    });
  }, []);

  const answerConfirm = useCallback((yes: boolean) => {
    setAskDialog(null);
    askOpenRef.current = false;
    askResolverRef.current?.(yes);
    askResolverRef.current = null;
  }, []);

  const advance = useCallback(() => {
    if (gameState !== 'PLAYING') return;
    if (choiceOpenRef.current) return;
    if (configOpenRef.current || askOpenRef.current) return;
    if (videoRef.current) { endVideo(); return; }
    // When the window is erased (一時消去), the first click only restores
    // it — it must not advance the script.
    if (windowHiddenRef.current) {
      windowHiddenRef.current = false;
      setWindowHidden(false);
      return;
    }
    if (typingRef.current) {
      finishTyping();
      return;
    }
    if (!waitingRef.current) return;

    // A mid-line [*] keeps the SAME page open (and the running voice);
    // anything else is a fresh page.
    if (!pageContinuesRef.current(ptrRef.current)) {
      freshLineRef.current = true;
      voiceRef.current = '';
      setCurrentVoice('');
      // ボイス非停止 OFF: a click cuts the playing voice clip.
      if (sfRef.current.voiceCut === false) audio.stopVoice();
    }
    waitingRef.current = false;
    setIsWaiting(false);
    void runSlice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, runSlice, endVideo]);

  const chooseOption = useCallback((opt: ChoiceOption) => {
    choiceOpenRef.current = false;
    pendingChoicesRef.current = [];
    setChoiceOptions(null);
    waitingRef.current = false;
    setIsWaiting(false);
    freshLineRef.current = true;
    (async () => {
      // A branch may only carry an exp assignment (no jump target).
      if (opt.exp) sandboxExec(opt.exp);
      if (opt.storage && opt.target.includes('|')) {
        const [s, l] = opt.target.split('|');
        await loadScenario(s || opt.storage, l);
      } else if (opt.storage) {
        await loadScenario(opt.storage, opt.target);
      } else if (opt.target) {
        if (jumpToLabel(opt.target)) void runSlice();
      } else {
        // Exp-only choice: continue past the [select] command.
        choiceOpenRef.current = false;
        ptrRef.current++;
        setPointer(ptrRef.current);
        void runSlice();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadScenario, runSlice]);

  const toggleAuto = useCallback(() => {
    setIsAutoMode(v => {
      const next = !v;
      autoRef.current = next;
      return next;
    });
    setIsFastForward(false);
    fastRef.current = false;
  }, []);

  const toggleFastForward = useCallback(() => {
    // Flip the ref synchronously: advances issued in the same tick must
    // already see fast-forward (transition times are zeroed while skipping).
    const next = !fastRef.current;
    fastRef.current = next;
    setIsFastForward(next);
    if (next) {
      setIsAutoMode(false);
      autoRef.current = false;
    }
  }, []);

  // Hold-to-skip: idempotent start/stop used by the Control key and the
  // pointer-held skip button (K remains a press-toggle).
  const startFastForward = useCallback(() => {
    if (fastRef.current || gameState !== 'PLAYING') return;
    fastRef.current = true;
    setIsFastForward(true);
    setIsAutoMode(false);
    autoRef.current = false;
  }, [gameState]);

  const stopFastForward = useCallback(() => {
    if (!fastRef.current) return;
    fastRef.current = false;
    setIsFastForward(false);
  }, []);

  // auto / skip driver
  useEffect(() => {
    if (gameState !== 'PLAYING') return;
    if (!isWaiting || choiceOpenRef.current) return;
    if (configOpenRef.current || askOpenRef.current) return;
    if (typingRef.current) return;
    if (isFastForward) {
      if (sfRef.current.skipMode === 'READ_ONLY' && !isRead(ptrRef.current - 1)) {
        setIsFastForward(false);
        fastRef.current = false;
        return;
      }
      const t = setTimeout(() => advance(), 60);
      return () => clearTimeout(t);
    }
    if (isAutoMode) {
      const len = dialogueText.length;
      // オート進行速度 slider (autoPos 0..255): per-char ms ~350 (slow)
      // → ~47 (fast), default pos 110 ≈ 90ms.
      const perChar = Math.round(14000 / ((sfRef.current.autoPos ?? 110) + 40));
      const t = setTimeout(() => advance(), Math.max(600, 40 + len * perChar));
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWaiting, isAutoMode, isFastForward, gameState, dialogueText, pointer]);

  // -------------------------------------------------------------------------
  // Saves
  // -------------------------------------------------------------------------

  const buildSaveData = (): SaveSlot => {
    // Transient per-layer tween state must not survive a save/load cycle
    // (otherwise loading would replay character entrance animations).
    const stage = structuredClone(stageRef.current);
    for (const c of Object.values(stage.chars)) {
      delete c.enterAnim;
      delete c.exitAnim;
      delete c.leaving;
    }
    for (const l of Object.values(stage.layers)) delete l.anim;
    return {
      currentScenario: scenarioRef.current,
      pointer: ptrRef.current,
      f: fRef.current,
      sf: sfRef.current,
      tf: tfRef.current,
      stage,
      bgm: bgmRef.current,
      speaker: speakerRef.current,
      dialogueText,
      timestamp: Date.now(),
      date: new Date().toLocaleString(),
    };
  };

  const writeSlot = (id: string, data: SaveSlot) => {
    setSaveSlots(prev => ({ ...prev, [id]: data }));
    if (id !== 'autosave') {
      const { historyLog: _h, ...meta } = data;
      localStorage.setItem(`${storagePrefix}_save_slot_${id}`, JSON.stringify(meta));
    } else {
      localStorage.setItem(`${storagePrefix}_autosave`, JSON.stringify(data));
    }
    const { historyLog: hist, ...payload } = data;
    fetch('/api/save-slot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Username': usernameRef.current,
        'X-Client-ID': clientIdRef.current,
      },
      body: JSON.stringify({ slot: String(id), data: { ...payload, historyLog: hist } }),
    }).catch(() => {});
  };

  const saveToSlot = useCallback((id: string | number, meta?: { note?: string; pinned?: boolean }) => {
    if (sceneReplayRef.current) return; // recollections cannot be bookmarked
    const data = buildSaveData();
    data.historyLog = historyRef.current.slice(-200);
    const prev = saveSlots[String(id)];
    if (meta?.note !== undefined) data.note = meta.note; else if (prev?.note) data.note = prev.note;
    if (meta?.pinned !== undefined) data.pinned = meta.pinned; else if (prev?.pinned) data.pinned = true;
    writeSlot(String(id), data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogueText, saveSlots]);

  // Edit note/pin on an existing slot without touching its scene snapshot.
  const updateSlotMeta = useCallback((id: string | number, patch: { note?: string; pinned?: boolean }) => {
    const cur = saveSlotsRef.current[String(id)];
    if (!cur) return;
    const next = { ...cur, ...patch };
    writeSlot(String(id), next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const saveSlotsRef = useRef<Record<string, SaveSlot>>({});
  useEffect(() => { saveSlotsRef.current = saveSlots; }, [saveSlots]);

  // autosave on each text stop
  useEffect(() => {
    if (gameState !== 'PLAYING' || !isWaiting) return;
    const t = setTimeout(() => {
      if (sceneReplayRef.current) return; // no bookmarks in recollection
      const data = buildSaveData();
      data.historyLog = historyRef.current.slice(-200);
      setSaveSlots(prev => ({ ...prev, autosave: data }));
      localStorage.setItem(`${storagePrefix}_autosave`, JSON.stringify(data));
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWaiting, gameState, pointer]);

  const restoreSnapshot = useCallback((data: SaveSlot, autoplay = true) => {
    // Loading a bookmark leaves any recollection replay.
    sceneReplayRef.current = null;
    setSceneReplay(null);
    setGameState('PLAYING');
    fRef.current = { ...(data.f || {}) };
    sfRef.current = { ...sfRef.current, ...(data.sf || {}) };
    tfRef.current = { ...(data.tf || {}) };
    setF({ ...fRef.current }); setSfState({ ...sfRef.current }); setTf({ ...tfRef.current });
    clearLeavingTimers();
    setIsSeeking(false);
    if (data.stage) {
      const restored = structuredClone(data.stage);
      for (const c of Object.values(restored.chars)) {
        delete c.enterAnim;
        delete c.exitAnim;
        delete c.leaving;
        // Saves written before the disposition model: derive from visible.
        if (!c.disp) c.disp = c.visible ? 'both' : 'clear';
      }
      for (const l of Object.values(restored.layers)) {
        delete l.anim;
        if (!l.afx) l.afx = 'center';
        if (!l.afy) l.afy = 'center';
      }
      stageRef.current = restored;
      commitStage();
    }
    textVisibleRef.current = true; setTextVisible(true);
    setWindowHidden(false);
    speakerRef.current = data.speaker || '';
    setSpeaker(data.speaker || '');
    setDialogueText(data.dialogueText || '');
    setTypewriterText(data.dialogueText || '');
    if (data.bgm) playBgmTrack(data.bgm);
    historyRef.current = data.historyLog || [];
    setHistoryLog(historyRef.current);
    void (async () => {
      const url = `/scenarios/${data.currentScenario.replace(/^scenarios\//, '')}.json`;
      const res = await fetch(url);
      const json = await res.json();
      applyScenarioData(data.currentScenario, json.instructions, null, data.pointer);
      waitingRef.current = true;
      setIsWaiting(true);
      freshLineRef.current = true;
      runningRef.current = false;
      void autoplay;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSaveSlot = useCallback((data: SaveSlot) => {
    runTokenRef.current++;
    runningRef.current = false;
    if (typingRef.current) { clearInterval(typingRef.current.timer); typingRef.current = null; }
    restoreSnapshot(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreSnapshot]);

  const quickLoad = useCallback(() => {
    const auto = saveSlots.autosave;
    if (auto) loadSaveSlot(auto);
  }, [saveSlots.autosave, loadSaveSlot]);

  const deleteSlot = useCallback((id: string | number) => {
    setSaveSlots(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    localStorage.removeItem(`${storagePrefix}_save_slot_${id}`);
    fetch('/api/delete-slot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Username': usernameRef.current,
        'X-Client-ID': clientIdRef.current,
      },
      body: JSON.stringify({ slot: String(id) }),
    }).catch(() => {});
  }, []);

  const replayVoice = useCallback((stem: string) => {
    if (stem) audio.playVoice(stem);
  }, []);

  return {
    metaReady,
    gameState, setGameState,
    currentScenario, pointer,
    stage, stageTransition, speaker, dialogueText, typewriterText,
    isWaiting, textVisible, advance, isSeeking,
    choiceOptions, chooseOption,
    video, onVideoEnded: endVideo,
    bgmStem, currentVoice,
    historyLog, replayVoice,
    sideTab, setSideTab,
    configOpen, setConfigOpen: setConfigOpenWrapped,
    askDialog, requestConfirm, answerConfirm,
    windowHidden, setWindowHidden,
    showGallery, setShowGallery,
    showMusic, setShowMusic,
    scenarioInstructions, seekToPointer,
    isAutoMode, toggleAuto,
    isFastForward, toggleFastForward, startFastForward, stopFastForward,
    language, setLanguage,
    f, setF, sf: sfState, setSf, tf,
    startNewGame, returnToTitle, loadScenario, loadSaveSlot, saveToSlot, quickLoad, deleteSlot,
    sceneReplay, startSceneReplay, finishSceneReplay, galleryViewMode, setGalleryViewMode,
    updateSlotMeta, saveSlots,
    sessionConflict,
  };
}
