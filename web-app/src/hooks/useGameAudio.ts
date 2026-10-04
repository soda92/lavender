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

export interface GameAudioHook {
  playBgm: (stem: string) => void;
  stopBgm: () => void;
  toggleBgm: () => void;
  isBgmPlaying: boolean;
  playSe: (stem: string) => void;
  playVoice: (stem: string) => void;
  stopVoice: () => void;
  bgmPlayer: ExtendedAudioElement;
  sePlayer: ExtendedAudioElement;
  voicePlayer: ExtendedAudioElement;
  currentVoiceRef: MutableRefObject<string | null>;
}

const MUTE_KEY = 'lavender_bgm_muted';

export function useGameAudio(vol = 8, sevol = 8): GameAudioHook {
  const currentVoiceRef = useRef<string | null>(null);
  const [isBgmPlaying, setIsBgmPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => localStorage.getItem(MUTE_KEY) === 'true');
  const isMutedRef = useRef<boolean>(isMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

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

  useEffect(() => {
    const bgmVol = typeof vol === 'number' && !isNaN(vol) ? vol : 8;
    const seVol = typeof sevol === 'number' && !isNaN(sevol) ? sevol : 8;
    bgmPlayer.volume = bgmVol / 10;
    sePlayer.volume = seVol / 10;
    voicePlayer.volume = seVol / 10;
  }, [vol, sevol]);

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
    const url = stem.startsWith('/') ? stem : mediaUrl(stem);
    if (!url) return;
    voicePlayer.src = url;
    currentVoiceRef.current = stem;
    voicePlayer.play().catch(e => console.log('Voice play interrupted', e));
  };

  const stopVoice = () => {
    voicePlayer.pause();
    currentVoiceRef.current = null;
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
    bgmPlayer,
    sePlayer,
    voicePlayer,
    currentVoiceRef,
  };
}
