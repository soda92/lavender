import { useEffect, useRef, useState, MutableRefObject } from 'react';
import { mediaUrl, mediaUrlFromPath } from '../game/metadata';

declare global {
  var __bgmPlayer__: HTMLAudioElement | undefined;
  var __sePlayer__: HTMLAudioElement | undefined;
  var __voicePlayer__: HTMLAudioElement | undefined;
}

// --- Singleton Audio Elements (persist across Vite HMR) ---
if (!globalThis.__bgmPlayer__) {
  globalThis.__bgmPlayer__ = new Audio();
  globalThis.__bgmPlayer__.loop = true;
}
if (!globalThis.__sePlayer__) {
  globalThis.__sePlayer__ = new Audio();
}
if (!globalThis.__voicePlayer__) {
  globalThis.__voicePlayer__ = new Audio();
}

interface ExtendedAudioElement extends HTMLAudioElement {
  __wasAutoPaused__?: boolean;
}

const bgmPlayer: ExtendedAudioElement = globalThis.__bgmPlayer__ as ExtendedAudioElement;
const sePlayer: ExtendedAudioElement = globalThis.__sePlayer__ as ExtendedAudioElement;
const voicePlayer: ExtendedAudioElement = globalThis.__voicePlayer__ as ExtendedAudioElement;

export interface AudioSettings {
  /** 0..100 bus gains (master multiplies every bus). */
  master?: number;
  bgm?: number;
  se?: number;
  voice?: number;
  /** duck BGM while a voice clip plays (sf.ボイスbgm下げ). */
  bgmDown?: boolean;
  /** char voice-prefix → muted (engine setVoiceOn). */
  voiceMute?: Record<string, boolean>;
  /** char voice-prefix → 0..100 per-character gain. */
  voiceGain?: Record<string, number>;
}

export interface GameAudioHook {
  playBgm: (stem: string) => void;
  stopBgm: () => void;
  toggleBgm: () => void;
  isBgmPlaying: boolean;
  playSe: (stem: string) => void;
  playVoice: (stem: string) => void;
  stopVoice: () => void;
  /** Bind the live settings source (the runner owns persisted sf). */
  bindSettings: (getter: () => AudioSettings) => void;
  bgmPlayer: ExtendedAudioElement;
  sePlayer: ExtendedAudioElement;
  voicePlayer: ExtendedAudioElement;
  currentVoiceRef: MutableRefObject<string | null>;
}

const MUTE_KEY = 'lavender_bgm_muted';

/** Voice stems are named "<char>_0001"; the engine keys per-char state on this. */
export const voiceCharOf = (stem: string): string => stem.split(/[_\/]/)[0] || '';

export function useGameAudio(): GameAudioHook {
  const currentVoiceRef = useRef<string | null>(null);
  const [isBgmPlaying, setIsBgmPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => localStorage.getItem(MUTE_KEY) === 'true');
  const isMutedRef = useRef<boolean>(isMuted);
  const settingsGetterRef = useRef<() => AudioSettings>(() => ({}));

  // Rebound every render by the App with the latest sf; volumes are
  // re-applied so config changes are heard immediately.
  const bindSettings = (getter: () => AudioSettings) => {
    settingsGetterRef.current = getter;
    applyVolumes();
  };

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const clamp = (v: number) => (Math.max(0, Math.min(100, v)) / 100);

  // Apply the four-bus volume model. Master scales every element; while a
  // voice plays with bgmDown set, the BGM bus ducks to 35%.
  const applyVolumes = () => {
    const s = settingsGetterRef.current();
    const master = clamp(s.master ?? 80);
    const ducked = s.bgmDown && currentVoiceRef.current != null;
    bgmPlayer.volume = master * clamp(s.bgm ?? 80) * (ducked ? 0.35 : 1);
    sePlayer.volume = master * clamp(s.se ?? 80);
    // voice bus × per-character gain
    const ch = currentVoiceRef.current ? voiceCharOf(currentVoiceRef.current) : '';
    const chGain = s.voiceGain && ch ? (s.voiceGain[ch] ?? 100) : 100;
    voicePlayer.volume = master * clamp(s.voice ?? 80) * clamp(chGain);
  };

  // Restore BGM volume when a voice clip finishes.
  useEffect(() => {
    const onEnded = () => {
      currentVoiceRef.current = null;
      applyVolumes();
    };
    voicePlayer.addEventListener('ended', onEnded);
    return () => voicePlayer.removeEventListener('ended', onEnded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPlay = () => setIsBgmPlaying(true);
    const onPause = () => setIsBgmPlaying(false);
    bgmPlayer.addEventListener('play', onPlay);
    bgmPlayer.addEventListener('pause', onPause);
    setIsBgmPlaying(!bgmPlayer.paused);
    return () => {
      bgmPlayer.removeEventListener('play', onPlay);
      bgmPlayer.removeEventListener('pause', onPause);
    };
  }, []);

  const playBgm = (stem: string) => {
    if (!stem) return;
    const url = stem.startsWith('/') ? stem : mediaUrlFromPath(stem);
    if (!url) return;
    if (bgmPlayer.dataset.stem !== stem) {
      bgmPlayer.src = url;
      bgmPlayer.dataset.stem = stem;
    }
    if (isMutedRef.current) {
      bgmPlayer.pause();
    } else if (bgmPlayer.paused) {
      bgmPlayer.play().catch(e => console.log('BGM play interrupted', e));
    }
  };

  const stopBgm = () => {
    bgmPlayer.pause();
    delete bgmPlayer.dataset.stem;
  };

  const playSe = (stem: string) => {
    if (!stem) return;
    const url = stem.startsWith('/') ? stem : mediaUrlFromPath(stem);
    if (!url) return;
    sePlayer.src = url;
    sePlayer.play().catch(e => console.log('SE play interrupted', e));
  };

  const playVoice = (stem: string) => {
    if (!stem) return;
    const s = settingsGetterRef.current();
    if (s.voiceMute?.[voiceCharOf(stem)]) return;
    const url = stem.startsWith('/') ? stem : mediaUrl(stem);
    if (!url) return;
    voicePlayer.src = url;
    currentVoiceRef.current = stem;
    applyVolumes();
    voicePlayer.play().catch(e => console.log('Voice play interrupted', e));
  };

  const stopVoice = () => {
    voicePlayer.pause();
    currentVoiceRef.current = null;
    applyVolumes();
  };

  const toggleBgm = () => {
    if (bgmPlayer.paused) {
      setIsMuted(false);
      localStorage.setItem(MUTE_KEY, 'false');
      bgmPlayer.play().catch(e => console.log('BGM play interrupted', e));
    } else {
      setIsMuted(true);
      localStorage.setItem(MUTE_KEY, 'true');
      bgmPlayer.pause();
    }
  };

  return {
    playBgm,
    stopBgm,
    toggleBgm,
    isBgmPlaying,
    playSe,
    playVoice,
    stopVoice,
    bindSettings,
    bgmPlayer,
    sePlayer,
    voicePlayer,
    currentVoiceRef,
  };
}
