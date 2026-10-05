import { useEffect, useState, type CSSProperties } from 'react';
import './App.css';
import { useGameAudio } from './hooks/useGameAudio';
import { useKagRunner } from './hooks/useKagRunner';
import GameplayScreen from './components/GameplayScreen';
import TitleScreen from './components/TitleScreen';
import HistoryModal from './components/HistoryModal';
import SettingsPanel from './components/SettingsPanel';
import ArchivesModal from './components/ArchivesModal';
import PageFlipper from './components/PageFlipper';
import GalleryScreen from './components/GalleryScreen';
import MusicRoom from './components/MusicRoom';

export default function App() {
  const [bootVol, setBootVol] = useState(8);
  const [bootSe, setBootSe] = useState(8);
  useEffect(() => {
    try {
      const sf = JSON.parse(localStorage.getItem('lavender_sf') || '{}');
      setBootVol(sf.vol ?? 8);
      setBootSe(sf.sevol ?? 8);
    } catch { /* ignore */ }
  }, []);

  // note: volumes are rebound after the runner hydrates system flags below.
  const audio = useGameAudio(bootVol, bootSe);
  const runner = useKagRunner(audio);
  const vol = runner.sf?.vol ?? bootVol;
  const sevol = runner.sf?.sevol ?? bootSe;
  useEffect(() => {
    audio.bgmPlayer.volume = (vol ?? 8) / 10;
  }, [vol, audio.bgmPlayer]);
  useEffect(() => {
    audio.sePlayer.volume = (sevol ?? 8) / 10;
    audio.voicePlayer.volume = (sevol ?? 8) / 10;
  }, [sevol, audio.sePlayer, audio.voicePlayer]);
  // Debug handle for browser-based soak testing.
  useEffect(() => { (window as any).__lavender = runner; }, [runner]);

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
  const stageLeft = (viewport.w - stageW) / 2;
  const stageTop = (viewport.h - stageH) / 2;
  const stripW = viewport.w - (stageLeft + stageW); // right letterbox width
  const PANEL_W = 340;
  // Dock into the right letterbox strip whenever it is wide (~232px+);
  // the panel width tracks the strip. Only on very narrow windows does it
  // fall back to overlaying the stage's right edge.
  const dockStyle = (): CSSProperties =>
    stripW >= 232
      ? { left: stageLeft + stageW + 8, top: stageTop, width: Math.min(stripW - 16, 380), height: stageH }
      : { left: stageLeft + stageW - PANEL_W - 6, top: stageTop, width: PANEL_W, height: stageH };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (runner.gameState !== 'PLAYING') {
        if (e.key === 'Escape') {
          runner.setShowHistory(false);
          runner.setShowSettings(false);
          runner.setShowArchives(false);
          runner.setShowFlipper(false);
        }
        return;
      }
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (typing) return;
      switch (e.key) {
        case 'Enter': case ' ': case 'ArrowRight': case 'ArrowDown':
          e.preventDefault(); runner.advance(); break;
        case 'Control': break;
        case 'Escape':
          if (runner.showHistory) runner.setShowHistory(false);
          else if (runner.showFlipper) runner.setShowFlipper(false);
          else if (runner.showArchives) runner.setShowArchives(false);
          else runner.setShowSettings(true);
          break;
        case 's': case 'S':
          if (e.ctrlKey) runner.saveToSlot('q'); break;
        case 'l': case 'L':
          if (e.ctrlKey) runner.quickLoad(); break;
        case 'j': case 'J':
          runner.toggleAuto(); break;
        case 'k': case 'K':
          runner.toggleFastForward(); break;
        default: break;
      }
    };
    const onCtrl = (e: KeyboardEvent) => {
      if (e.key === 'Control' && runner.gameState === 'PLAYING') runner.toggleFastForward();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onCtrl);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onCtrl);
    };
  }, [runner]);

  if (!runner.metaReady) {
    return <div className="boot-screen">光輪の町、ラベンダーの少女<br /><span>Now Loading…</span></div>;
  }

  return (
    <div className="app-root">
      <div
        className="stage-frame"
        style={{ width: 800, height: 600, transform: `scale(${scale})` }}
      >
        {runner.gameState === 'TITLE' && (
          <TitleScreen
            onStart={runner.startNewGame}
            onContinue={() => runner.setShowArchives(true)}
            onGallery={() => runner.setGameState('GALLERY')}
            onMusic={() => runner.setGameState('MUSIC')}
            hasAutosave={!!runner.saveSlots.autosave}
            playBgm={audio.playBgm}
          />
        )}

        {runner.gameState === 'PLAYING' && <GameplayScreen runner={runner} />}

        {runner.gameState === 'GALLERY' && (
          <GalleryScreen sf={runner.sf} onBack={() => runner.setGameState('TITLE')} />
        )}
        {runner.gameState === 'MUSIC' && (
          <MusicRoom onBack={() => runner.setGameState('TITLE')} audio={audio} />
        )}

        {runner.showHistory && (
          <HistoryModal
            items={runner.historyLog}
            onClose={() => runner.setShowHistory(false)}
            onReplayVoice={runner.replayVoice}
          />
        )}
        {runner.showSettings && (
          <SettingsPanel runner={runner} onClose={() => runner.setShowSettings(false)} />
        )}
      </div>

      {/* Side panels dock into the letterbox space, never over the stage. */}
      {runner.showArchives && (
        <ArchivesModal
          dockStyle={dockStyle()}
          slots={runner.saveSlots}
          playing={runner.gameState === 'PLAYING'}
          currentScenario={runner.currentScenario}
          currentPointer={runner.pointer}
          currentSpeaker={runner.speaker}
          currentDialogue={runner.dialogueText}
          onSave={(id, meta) => runner.saveToSlot(id, meta)}
          onLoad={(slot) => { runner.loadSaveSlot(slot as any); runner.setShowArchives(false); }}
          onDelete={(id) => runner.deleteSlot(id)}
          onUpdateMeta={(id, patch) => runner.updateSlotMeta(id, patch)}
          onClose={() => runner.setShowArchives(false)}
        />
      )}
      {runner.showFlipper && runner.gameState === 'PLAYING' && (
        <PageFlipper
          dockStyle={dockStyle()}
          instructions={runner.scenarioInstructions}
          pointer={runner.pointer}
          scenario={runner.currentScenario}
          onSeek={(ptr) => runner.seekToPointer(ptr)}
          onClose={() => runner.setShowFlipper(false)}
        />
      )}
    </div>
  );
}
