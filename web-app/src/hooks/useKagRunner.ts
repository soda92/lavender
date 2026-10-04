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
} from '../game/metadata';
import type { EnvInit } from '../game/metadata';

// ---------------------------------------------------------------------------
// World state
// ---------------------------------------------------------------------------

export interface CharState {
  name: string;
  visible: boolean;
  front: boolean;
  level: number;
  xpos: number;
  opacity: number;
  pose?: string;
  dress?: string;
  diff?: string;
  face?: string;
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
}

export interface EnvAdjust {
  grayscale?: boolean;
  rgamma?: number;
  ggamma?: number;
  bgamma?: number;
}

export interface BgEffect {
  zoom?: number;   // percent
  xpos?: number;
  ypos?: number;
  blur?: number;
  brightness?: number;
}

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
}

export interface HistoryItem {
  speaker: string;
  text: string;
  voice: string;
  scenario: string;
  pointer: number;
}

type GameState = 'TITLE' | 'PLAYING' | 'SETTINGS' | 'GALLERY' | 'MUSIC';

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

function sandboxEval(exp: string, f: any, sf: any, tf: any, skipMode: number): any {
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
      { skipMode, isRecollection: false },
      {},
      ...Object.values(KAG_CONSTS),
    );
  } catch (e) {
    console.warn('eval failed:', exp, e);
    return undefined;
  }
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
  const [stageTransition, setStageTransition] = useState<{
    old: StageState; cls: string; ms: number; key: number;
  } | null>(null);
  const [speaker, setSpeaker] = useState('');
  const [dialogueText, setDialogueText] = useState('');
  const [typewriterText, setTypewriterText] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [textVisible, setTextVisible] = useState(true);
  const [choiceOptions, setChoiceOptions] = useState<ChoiceOption[] | null>(null);
  const [bgmStem, setBgmStem] = useState<string | null>(null);
  const [currentVoice, setCurrentVoice] = useState('');
  const [chapterCard, setChapterCard] = useState<{ title: string; key: number } | null>(null);
  const [video, setVideo] = useState<{ stem: string } | null>(null);
  const videoRef = useRef<{ stem: string } | null>(null);
  const [historyLog, setHistoryLog] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isFastForward, setIsFastForward] = useState(false);
  const [language, setLanguage] = useState<'JP' | 'EN'>('JP');
  const [sessionConflict, setSessionConflict] = useState(false);

  const [f, setF] = useState<Record<string, any>>({});
  const [sfState, setSfState] = useState<Record<string, any>>({
    vol: 8,
    sevol: 8,
    skipMode: 'ALL',
    readScenarios: {},
    bgmSeen: {},
    cgSeen: {},
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
        if (data?.stage) slots[id] = data as SaveSlot;
      }
      // local slot metadata (notes/pins)
      for (let i = 0; i < 12; i++) {
        const raw = localStorage.getItem(`${storagePrefix}_save_slot_${i}`);
        if (raw) {
          try {
            const local = JSON.parse(raw);
            if (slots[i]) slots[i] = { ...slots[i], note: local.note, pinned: local.pinned };
          } catch { /* ignore */ }
        }
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

  // Visual changes inside a begintrans/endtrans block mutate the draft but are
  // committed once at endtrans; outside blocks commit immediately.
  const commitStage = () => {
    const next = structuredClone(stageRef.current);
    lastCommittedRef.current = next;
    if (!transOpenRef.current) setStage(next);
  };

  const setQuake = (h: number, v: number, time: number) => {
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
    if (stem) audio.playBgm(stem); else audio.stopBgm();
  };

  const ensureChar = (name: string): CharState => {
    const reg = resolveRegisteredName(name);
    if (!stageRef.current.chars[reg]) {
      stageRef.current.chars[reg] = {
        name: reg, visible: false, front: false, level: envinitRef.current?.defaultLevel ?? 1,
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
    opts: { autostart?: boolean } = { autostart: true },
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
    applyScenarioData(name, json.instructions, label, overridePtr);
    freshLineRef.current = true;
    if (opts.autostart !== false) {
      runningRef.current = false;
      void runSlice();
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNewGame = useCallback(() => {
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
      audio.playVoice(args.voice);
      setCurrentVoice(args.voice);
    }
    if (!hasVisualTokens && argv.length === 0) return; // voice/nameplate only
    if (!hasVisualTokens) return; // transition-only action

    const ch = ensureChar(name);
    let touched = false;
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
          ch.visible = true; touched = true; break;
        case 'hide':
          ch.visible = false; touched = true; break;
        case 'front':
          ch.front = tok === 'front'; touched = true; break;
        default:
          break;
      }
    }
    if (args.opacity != null) ch.opacity = parseInt(String(args.opacity), 10) || 0;
    if (args.xpos != null) ch.xpos = parseInt(String(args.xpos), 10) || 0;
    if (!ch.diff) ch.diff = '基本';
    if (touched) ch.visible = ch.visible || !argv.some(t => classifyToken(name, t) === 'hide');
  };

  const upsertLayer = (key: string, init: Partial<DynLayer>): DynLayer => {
    if (!stageRef.current.layers[key]) {
      stageRef.current.layers[key] = {
        name: key, visible: true, front: false, level: 5,
        xpos: null, ypos: null, opacity: 255, ...init,
      };
    }
    return stageRef.current.layers[key];
  };

  const applyLayerArgs = (ly: DynLayer, args: Record<string, any>, argv: string[]) => {
    if (args.file) ly.file = args.file;
    if (args.level != null) ly.level = parseInt(String(args.level), 10) || ly.level;
    if (args.xpos != null) ly.xpos = parseInt(String(args.xpos), 10);
    if (args.ypos != null) ly.ypos = parseInt(String(args.ypos), 10);
    if (args.opacity != null) ly.opacity = parseInt(String(args.opacity), 10) || 0;
    if (argv.includes('show')) ly.visible = true;
    if (argv.includes('hide')) ly.visible = false;
    if (argv.includes('front')) ly.front = true;
    if (argv.includes('back')) ly.front = false;
    if (!ly.file && args.storage) ly.file = args.storage;
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
    const args: Record<string, any> = inst.args || {};
    const argv: string[] = inst.argv || [];
    const lname = name.toLowerCase();
    const world = stageRef.current;

    // ---- flow control ----
    if (name === 'next') {
      if (args.eval && !sandboxEval(args.eval, fRef.current, sfRef.current, tfRef.current, skipModeNum())) {
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
      world.bgEffect = {}; // a new stage resets the camera
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
      const skipping = fastRef.current || rangeSkipRef.current;
      // No method (or explicit notrans): atomic cut.
      if (!method || method === 'notrans') {
        commitStage();
        if (waitMs && !skipping) await sleep(waitMs);
        return 'continue';
      }
      const anim = transAnim(method);
      const ms = waitMs || anim.ms;
      const old = lastCommittedRef.current;
      commitStage(); // reveal the new scene underneath
      if (!skipping) {
        setStageTransition({ old, cls: anim.cls, ms, key: ++transKeyRef.current });
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = setTimeout(() => setStageTransition(null), ms + 80);
      }
      if (waitMs && !skipping) await sleep(waitMs);
      return 'continue';
    }

    if (name === 'bg') {
      const stem = args.file || args.storage || args.str;
      if (stem) {
        world.bg = { stem: String(stem).replace(/\.\w+$/, ''), time: world.bg?.time || '昼' };
        world.bgEffect = {};
        world.bgHidden = false;
      } else {
        // Background camera / filter control (never sets an image).
        const eff: BgEffect = { ...world.bgEffect };
        for (const k of ['zoom', 'xpos', 'ypos', 'blur', 'brightness'] as const) {
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
      const ly = upsertLayer('__event__', { front: true, level: 6 });
      applyLayerArgs(ly, args, argv);
      if (argv.includes('hide') || args.visible === 'false') ly.visible = false;
      if (ly.file && /^ev/.test(ly.file)) markCgSeen(ly.file);
      commitStage();
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
      }
      return 'continue';
    }
    if (name === 'dellay') {
      if (args.name) delete world.layers[String(args.name)];
      commitStage();
      return 'continue';
    }
    if (world.layers[name]) {
      applyLayerArgs(world.layers[name], args, argv);
      commitStage();
      return 'continue';
    }
    if (/^ev/i.test(name) && mediaUrl(name)) {
      const ly = upsertLayer(name, { file: name, front: true, level: 6 });
      applyLayerArgs(ly, args, argv);
      markCgSeen(name);
      commitStage();
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
      for (const ch of Object.values(world.chars)) ch.visible = !hide;
      if (name === 'hideall') for (const ly of Object.values(world.layers)) ly.visible = false;
      if (name === 'allchar' && argv.includes('show')) for (const ch of Object.values(world.chars)) ch.visible = true;
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
      const ref = args.storage || args.file || args.name;
      if (args.stop != null || argv.includes('stop') || args.fadeout != null) playBgmTrack(null);
      else if (ref) playBgmTrack(String(ref).replace(/\.\w+$/, ''));
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
      if (mediaUrl(stem)) audio.playSe(stem);
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
      const t = parseInt(args.time || '200', 10);
      if (fastRef.current) await sleep(30);
      else await sleep(Math.min(t, 4000));
      return 'continue';
    }
    if (name === 'waitclick' || name === 'waitvolume') {
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
        // Skipping through: do not play the movie.
        if (fastRef.current || rangeSkipRef.current) return 'continue';
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

    // ---- chapter cards ----
    if (name === 'intermission') {
      if (args.state === 'clear') setChapterCard(null);
      else if (args.text) setChapterCard({ title: String(args.text), key: Date.now() });
      return 'continue';
    }
    if (name === 'chaptitle') {
      if (argv.includes('hide')) setChapterCard(null);
      return 'continue';
    }

    // ---- system navigation ----
    if (name === 'sysjump' && String(args.to || '') === 'title') {
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
      setChoiceOptions(null);
      setChapterCard(null);
      setTextVisible(true); textVisibleRef.current = true;
      setGameState('TITLE');
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
        { skipMode: skipModeNum(), isRecollection: false }, {},
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

  const typewriter = (full: string, done: () => void) => {
    if (fastRef.current) {
      setTypewriterText(full);
      done();
      return;
    }
    let i = 0;
    setTypewriterText('');
    const speed = (sfRef.current.textSpeed ?? 2); // chars per tick
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
        if (ptrRef.current >= data.length) break;
        if (choiceOpenRef.current) break;
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

        if (inst.type === 'label' || inst.type === 'comment') { ptrRef.current++; continue; }
        if (inst.type === 'line_feed') { ptrRef.current++; continue; }
        if (inst.type === 'page_break' || inst.type === 'clear_text') {
          freshLineRef.current = true;
          ptrRef.current++;
          continue;
        }
        if (inst.type === 'text') {
          const raw = String(inst.text_jp || inst.text || '');
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
          if (freshLineRef.current) {
            // Spoken lines always carry a 【name】 prefix; narration clears it.
            speakerRef.current = m ? plateName(m[1]) : '';
            setSpeaker(speakerRef.current);
            // The framework hides the window with msgoff before transitions
            // and implicitly reopens it when the next line starts.
            textVisibleRef.current = true;
            setTextVisible(true);
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
            setDialogueText(prev => prev + body);
            const last = historyRef.current[historyRef.current.length - 1];
            if (last) { last.text += body; setHistoryLog([...historyRef.current]); }
          }
          ptrRef.current++;
          setPointer(ptrRef.current);
          waitingRef.current = true;
          setIsWaiting(true);
          const stopToken = myToken;
          typewriter(body, () => { if (stopToken === runTokenRef.current) { /* idle on click */ } });
          break;
        }
        if (inst.type === 'wait_click') {
          freshLineRef.current = false;
          ptrRef.current++;
          setPointer(ptrRef.current);
          waitingRef.current = true;
          setIsWaiting(true);
          break;
        }
        if (inst.type !== 'command') { ptrRef.current++; continue; }

        const outcome = await handleCommand(inst);
        if (myToken !== runTokenRef.current) break;
        if (outcome === 'jump') {
          // new scenario loaded; continue interpreting
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

  const advance = useCallback(() => {
    if (gameState !== 'PLAYING') return;
    if (choiceOpenRef.current) return;
    if (videoRef.current) { endVideo(); return; }
    if (typingRef.current) {
      finishTyping();
      return;
    }
    if (!waitingRef.current) return;

    const data = dataRef.current;
    if (!data) return;
    // peek: is the current instruction a line feed ending this line?
    const here = data[ptrRef.current];
    if (here?.type === 'wait_click') {
      // handled inside runSlice via continue (freshLine stays false)
    } else {
      freshLineRef.current = true;
      voiceRef.current = '';
      setCurrentVoice('');
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
      if (opt.storage && opt.target.includes('|')) {
        const [s, l] = opt.target.split('|');
        await loadScenario(s || opt.storage, l);
      } else if (opt.storage) {
        await loadScenario(opt.storage, opt.target);
      } else {
        if (jumpToLabel(opt.target)) void runSlice();
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
    setIsFastForward(v => {
      const next = !v;
      fastRef.current = next;
      if (next) setIsAutoMode(false);
      autoRef.current = false;
      return next;
    });
  }, []);

  // auto / skip driver
  useEffect(() => {
    if (gameState !== 'PLAYING') return;
    if (!isWaiting || choiceOpenRef.current) return;
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
      const t = setTimeout(() => advance(), Math.max(700, 40 + len * 90));
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWaiting, isAutoMode, isFastForward, gameState, dialogueText, pointer]);

  // -------------------------------------------------------------------------
  // Saves
  // -------------------------------------------------------------------------

  const buildSaveData = (): SaveSlot => ({
    currentScenario: scenarioRef.current,
    pointer: ptrRef.current,
    f: fRef.current,
    sf: sfRef.current,
    tf: tfRef.current,
    stage: structuredClone(stageRef.current),
    bgm: bgmRef.current,
    speaker: speakerRef.current,
    dialogueText,
    timestamp: Date.now(),
    date: new Date().toLocaleString(),
  });

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

  const saveToSlot = useCallback((id: string | number) => {
    const data = buildSaveData();
    data.historyLog = historyRef.current.slice(-200);
    writeSlot(String(id), data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogueText]);

  // autosave on each text stop
  useEffect(() => {
    if (gameState !== 'PLAYING' || !isWaiting) return;
    const t = setTimeout(() => {
      const data = buildSaveData();
      data.historyLog = historyRef.current.slice(-200);
      setSaveSlots(prev => ({ ...prev, autosave: data }));
      localStorage.setItem(`${storagePrefix}_autosave`, JSON.stringify(data));
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWaiting, gameState, pointer]);

  const restoreSnapshot = useCallback((data: SaveSlot, autoplay = true) => {
    setGameState('PLAYING');
    fRef.current = { ...(data.f || {}) };
    sfRef.current = { ...sfRef.current, ...(data.sf || {}) };
    tfRef.current = { ...(data.tf || {}) };
    setF({ ...fRef.current }); setSfState({ ...sfRef.current }); setTf({ ...tfRef.current });
    if (data.stage) { stageRef.current = structuredClone(data.stage); commitStage(); }
    textVisibleRef.current = true; setTextVisible(true);
    speakerRef.current = data.speaker || '';
    setSpeaker(data.speaker || '');
    setDialogueText(data.dialogueText || '');
    setTypewriterText(data.dialogueText || '');
    setChapterCard(null);
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
  }, []);

  const replayVoice = useCallback((stem: string) => {
    if (stem) audio.playVoice(stem);
  }, []);

  return {
    metaReady,
    gameState, setGameState,
    currentScenario, pointer,
    stage, stageTransition, speaker, dialogueText, typewriterText,
    isWaiting, textVisible, advance,
    choiceOptions, chooseOption,
    chapterCard, video, onVideoEnded: endVideo,
    bgmStem, currentVoice,
    historyLog, showHistory, setShowHistory, replayVoice,
    showSettings, setShowSettings,
    showGallery, setShowGallery,
    showMusic, setShowMusic,
    isAutoMode, toggleAuto,
    isFastForward, toggleFastForward,
    language, setLanguage,
    f, setF, sf: sfState, setSf, tf,
    startNewGame, loadScenario, loadSaveSlot, saveToSlot, quickLoad, deleteSlot, saveSlots,
    sessionConflict,
  };
}
