import { useEffect, useState } from 'react';
import './App.css';
import { useGameAudio } from './hooks/useGameAudio';
import { useKagRunner } from './hooks/useKagRunner';
import GameplayScreen from './components/GameplayScreen';
import TitleScreen from './components/TitleScreen';
import HistoryModal from './components/HistoryModal';
import SettingsPanel from './components/SettingsPanel';
import SavesModal from './components/SavesModal';
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
  const [savesMode, setSavesMode] = useState<null | 'save' | 'load'>(null);

  // Debug handle for browser-based soak testing.
  useEffect(() => { (window as any).__lavender = runner; }, [runner]);

  // Fit the 800x600 stage into the viewport.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const onResize = () => setScale(Math.min(window.innerWidth / 800, window.innerHeight / 600));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (runner.gameState !== 'PLAYING') {
        if (e.key === 'Escape') {
          runner.setShowHistory(false);
          runner.setShowSettings(false);
          setSavesMode(null);
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
          else if (savesMode) setSavesMode(null);
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
  }, [runner, savesMode]);

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
            onContinue={() => setSavesMode('load')}
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
        {savesMode && runner.gameState === 'PLAYING' && (
          <SavesModal
            mode={savesMode}
            slots={runner.saveSlots}
            onSave={(id) => { runner.saveToSlot(id); setSavesMode(null); }}
            onLoad={(slot) => { runner.loadSaveSlot(slot); setSavesMode(null); }}
            onDelete={(id) => runner.deleteSlot(id)}
            onClose={() => setSavesMode(null)}
          />
        )}
        {savesMode === 'load' && runner.gameState === 'TITLE' && (
          <SavesModal
            mode="load"
            slots={runner.saveSlots}
            onLoad={(slot) => { runner.loadSaveSlot(slot); setSavesMode(null); }}
            onDelete={(id) => runner.deleteSlot(id)}
            onClose={() => setSavesMode(null)}
          />
        )}
      </div>
    </div>
  );
}
