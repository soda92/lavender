import { useEffect, useRef, useState, type CSSProperties } from 'react';
import './App.css';
import { useGameAudio } from './hooks/useGameAudio';
import { useKagRunner } from './hooks/useKagRunner';
import GameplayScreen from './components/GameplayScreen';
import TitleScreen from './components/TitleScreen';
import SidePanel, { type SideTab } from './components/SidePanel';
import ConfigOverlay from './components/ConfigOverlay';
import SkinDialog from './components/SkinDialog';
import { CURSOR_DESIGN, CURSOR_OVER } from './game/skin';
import { setDebugTimeScale, getDebugTimeScale } from './game/debugTiming';
import { captureTransition, downloadLastCapture, type CaptureOptions } from './game/transitionCapture';
import GalleryScreen from './components/GalleryScreen';
import MusicRoom from './components/MusicRoom';
import DebugPanel from './components/DebugPanel';
import { useT } from './game/i18n';

export default function App() {
  const t = useT();

  // The runner owns persisted sf (including the 4 volume buses); bind the
  // audio hook straight to it. Legacy vol/sevol (0..10) are migrated.
  const audio = useGameAudio();
  const runner = useKagRunner(audio);
  const sf = runner.sf || {};
  audio.bindSettings(() => ({
    master: sf.masterVol ?? 80,
    bgm: sf.bgmVol ?? (sf.vol != null ? sf.vol * 10 : 80),
    se: sf.seVol ?? (sf.sevol != null ? sf.sevol * 10 : 80),
    voice: sf.voiceVol ?? (sf.sevol != null ? sf.sevol * 10 : 80),
    bgmDown: !!sf.bgmDown,
    voiceMute: sf.voiceMute || {},
    voiceGain: sf.voiceGain || {},
  }));
  // Debug handle for browser-based soak testing.
  useEffect(() => {
    (window as any).__lavender = {
      ...runner,
      setDebugTimeScale,
      getDebugTimeScale,
      captureTransition: (opts?: CaptureOptions) => captureTransition(runner, opts),
      downloadLastCapture,
    };
  }, [runner]);

  // Dev-only BGM/engine debugger overlay (toggled with D, like G-senjou).
  const [debugOpen, setDebugOpen] = useState(false);
  useEffect(() => { (window as any).__lavenderDebug = { open: () => setDebugOpen(true), close: () => setDebugOpen(false), toggle: () => setDebugOpen(v => !v) }; }, []);

  // Fit the 800x600 stage into the viewport; track size so side panels can
  // dock into the black letterbox space beside the stage.
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const scale = Math.min(viewport.w / 800, viewport.h / 600);
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const stageW = 800 * scale;
  const stageH = 600 * scale;
  const stageTop = (viewport.h - stageH) / 2;
  const totalBlack = Math.max(0, viewport.w - stageW); // both side margins combined

  // A side panel is open: the stage frame gets marginRight = panelW + gap
  // (unscaled px; valid at any scale because its visual centering derives
  // from its layout center), which shifts the scaled stage LEFT and frees
  // the combined left+right letterbox space for the panel.
  const panelOpen = runner.sideTab != null;
  const panelW = Math.round(Math.min(380, totalBlack - 16));
  const dockOutside = panelOpen && panelW >= 280;
  const stageShift = dockOutside ? panelW + 16 : 0;
  // Shifted visual geometry of the stage.
  const stageLeft = dockOutside ? (totalBlack - panelW - 16) / 2 : (viewport.w - stageW) / 2;

  const dockStyle = (): CSSProperties =>
    dockOutside
      ? { left: stageLeft + stageW + 8, top: stageTop, width: panelW, height: stageH }
      : { left: (viewport.w + stageW) / 2 - 346, top: stageTop, width: 340, height: stageH };

  const openTab = (tab: SideTab) =>
    runner.setSideTab(runner.sideTab === tab ? null : tab);

  // Chord tracking so Ctrl is treated as a skip toggle only when it was
  // pressed AND released on this page without a combo (S/L/R). A Ctrl keyup
  // after a Ctrl+R reload must not start skipping.
  const ctrlHeldRef = useRef(false);
  const ctrlComboRef = useRef(false);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typingEl = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      // Modal overlays own the keyboard (Esc closes them).
      if (runner.configOpen || runner.askDialog) return;
      // D toggles the BGM debugger regardless of game state (G-senjou parity).
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey && !e.altKey && !typingEl) {
        e.preventDefault();
        setDebugOpen(prev => !prev);
        return;
      }
      if (runner.gameState !== 'PLAYING') {
        if (e.key === 'Escape') runner.setSideTab(null);
        return;
      }
      const typing = typingEl;
      if (typing) return;
      switch (e.key) {
        case 'Enter': case 'ArrowRight': case 'ArrowDown':
          e.preventDefault(); runner.advance(); break;
        case ' ': case 'c': case 'C':
          // Erase / restore the message window (G-senjou Space/C behavior).
          e.preventDefault();
          if (!e.repeat) runner.setWindowHidden(!runner.windowHidden);
          break;
        case 'i': case 'I':
          runner.setSf((prev: any) => ({ ...prev, immerseMode: !prev.immerseMode }));
          break;
        case 'Control':
          ctrlHeldRef.current = true;
          ctrlComboRef.current = false;
          break;
        case 'Escape':
          if (runner.sideTab) runner.setSideTab(null);
          else runner.setConfigOpen(true);
          break;
        case 's': case 'S':
          if (e.ctrlKey) { ctrlComboRef.current = true; runner.saveToSlot('q'); }
          break;
        case 'l': case 'L':
          if (e.ctrlKey) { ctrlComboRef.current = true; runner.quickLoad(); }
          break;
        case 'j': case 'J':
          runner.toggleAuto(); break;
        case 'k': case 'K':
          runner.toggleFastForward(); break;
        case 'n': case 'N':
          e.preventDefault();
          openTab('navigator');
          break;
        default:
          if (e.ctrlKey) ctrlComboRef.current = true;
          break;
      }
    };
    const onCtrl = (e: KeyboardEvent) => {
      if (e.key !== 'Control') return;
      const held = ctrlHeldRef.current;
      const combo = ctrlComboRef.current;
      ctrlHeldRef.current = false;
      ctrlComboRef.current = false;
      // Only a bare Control press/release on this page toggles skip.
      if (held && !combo && runner.gameState === 'PLAYING') runner.toggleFastForward();
    };
    const onBlur = () => { ctrlHeldRef.current = false; ctrlComboRef.current = false; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onCtrl);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onCtrl);
      window.removeEventListener('blur', onBlur);
    };
  }, [runner]);

  if (!runner.metaReady) {
    return <div className="boot-screen">光輪の町、ラベンダーの少女<br /><span>{t('boot.loading')}</span></div>;
  }

  return (
    <div className="app-root">
      <div
        className="stage-frame"
        style={{
          width: 800, height: 600,
          transform: `scale(${scale})`, marginRight: stageShift,
          '--cur-normal': sf.designCursor === false
            ? 'default'
            : `url(${CURSOR_DESIGN}) 0 0, default`,
          '--cur-over': sf.designCursor === false
            ? 'pointer'
            : `url(${CURSOR_OVER}) 0 0, pointer`,
          cursor: 'var(--cur-normal)',
        } as CSSProperties}
      >
        {runner.gameState === 'TITLE' && (
          <TitleScreen
            onStart={runner.startNewGame}
            onContinue={() => runner.setSideTab('archives')}
            onGallery={() => { runner.setGalleryViewMode('cg'); runner.setGameState('GALLERY'); }}
            onSettings={() => runner.setConfigOpen(true)}
            hasAutosave={!!runner.saveSlots.autosave}
            playBgm={audio.playBgm}
          />
        )}

        {runner.gameState === 'PLAYING' && <GameplayScreen runner={runner} />}

        {runner.gameState === 'GALLERY' && (
          <GalleryScreen
            sf={runner.sf}
            onBack={() => runner.setGameState('TITLE')}
            onMusic={() => runner.setGameState('MUSIC')}
            initialViewMode={runner.galleryViewMode}
            onPlayScene={runner.startSceneReplay}
          />
        )}
        {runner.gameState === 'MUSIC' && (
          <MusicRoom
            onBack={() => runner.setGameState('TITLE')}
            audio={audio}
            seen={runner.sf?.bgmSeen || {}}
          />
        )}

        {/* authentic full-stage overlays (config + Yes/No asks) */}
        {runner.configOpen && <ConfigOverlay runner={runner} />}
        {runner.askDialog && (
          <SkinDialog kind={runner.askDialog} onAnswer={runner.answerConfirm} />
        )}

      </div>

      {/* Unified docked panel: backlog / navigator / archives / settings. */}
      {runner.sideTab && (
        <SidePanel
          tab={runner.sideTab as SideTab}
          playing={runner.gameState === 'PLAYING'}
          dockStyle={dockStyle()}
          runner={runner}
          onTab={openTab}
          onClose={() => runner.setSideTab(null)}
        />
      )}

      {/* Dev-only BGM/engine debugger (D to toggle); unscaled, click-safe. */}
      {debugOpen && (
        <DebugPanel runner={runner} audio={audio} onClose={() => setDebugOpen(false)} />
      )}
    </div>
  );
}
