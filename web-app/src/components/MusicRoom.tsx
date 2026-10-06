import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../game/i18n';

interface Props {
  onBack: () => void;
  audio: {
    playBgm: (s: string) => void;
    stopBgm: () => void;
    bgmPlayer: HTMLAudioElement;
  };
  /** sf.bgmSeen: stems already heard in the game */
  seen?: Record<string, boolean | undefined>;
}

const naturalCmp = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const fmt = (sec: number) => {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const MusicRoom: React.FC<Props> = ({ onBack, audio, seen }) => {
  const t = useT();
  const player = audio.bgmPlayer;

  const [titles, setTitles] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/soundlist')
      .then(r => r.json())
      .then(setTitles)
      .catch(() => setTitles({}));
  }, []);

  // Canonical order follows soundlist.csv (natural stem order).
  const stems = useMemo(() => Object.keys(titles).sort(naturalCmp), [titles]);
  const unlocked = useMemo(
    () => new Set(stems.filter(s => seen?.[s])),
    [stems, seen],
  );

  // The player loops in-game; in the room we want "ended" so tracks advance.
  useEffect(() => {
    const prevLoop = player.loop;
    player.loop = false;
    return () => { player.loop = prevLoop; };
  }, [player]);

  useEffect(() => {
    const sync = () => {
      setCurrent(player.dataset.stem || null);
      setPlaying(!player.paused);
    };
    const onTime = () => setCur(player.currentTime);
    const onMeta = () => setDur(player.duration || 0);
    player.addEventListener('play', sync);
    player.addEventListener('pause', sync);
    player.addEventListener('ended', sync);
    player.addEventListener('timeupdate', onTime);
    player.addEventListener('loadedmetadata', onMeta);
    sync();
    setCur(player.currentTime || 0);
    setDur(player.duration || 0);
    return () => {
      player.removeEventListener('play', sync);
      player.removeEventListener('pause', sync);
      player.removeEventListener('ended', sync);
      player.removeEventListener('timeupdate', onTime);
      player.removeEventListener('loadedmetadata', onMeta);
    };
  }, [player]);

  const play = (stem: string) => {
    if (!unlocked.has(stem)) return;
    if (player.dataset.stem === stem && !player.paused) {
      player.pause();
    } else {
      audio.playBgm(stem);
    }
  };

  const step = (dir: 1 | -1) => {
    const list = stems.filter(s => unlocked.has(s));
    if (!list.length) return;
    const idx = current ? list.indexOf(current) : -1;
    const nextStem = list[(idx + dir + list.length) % list.length];
    audio.playBgm(nextStem);
  };

  // Auto-advance through unlocked tracks when one finishes.
  useEffect(() => {
    const onEnded = () => step(1);
    player.addEventListener('ended', onEnded);
    return () => player.removeEventListener('ended', onEnded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, stems, current, unlocked]);

  const loaded = stems.length > 0;
  const currentTitle = current ? titles[current] || current : null;

  return (
    <div className="extras-screen">
      <div className="extras-head">
        <h2>{t('music.title')}</h2>
        {loaded && (
          <span className="extras-count">
            {t('music.unlocked', { n: unlocked.size, total: stems.length })}
          </span>
        )}
        <button onClick={() => { audio.stopBgm(); onBack(); }}>
          {t('gallery.toTitle')}
        </button>
      </div>

      <div className="music-list">
        {stems.map((stem, i) => {
          const isUnlocked = unlocked.has(stem);
          const isCurrent = current === stem;
          return (
            <div
              key={stem}
              className={[
                'music-row',
                isCurrent ? 'playing' : '',
                isUnlocked ? '' : 'locked',
              ].join(' ')}
              onClick={() => play(stem)}
            >
              <span className="music-num">{String(i + 1).padStart(2, '0')}</span>
              {isCurrent && playing ? (
                <span className="music-eq" aria-hidden>
                  <i /><i /><i />
                </span>
              ) : (
                <span className="music-mark" aria-hidden>{isUnlocked ? '♪' : '🔒'}</span>
              )}
              <span className="music-info">
                <span className="music-title">
                  {isUnlocked ? titles[stem] || stem : '？？？？'}
                </span>
                <span className="music-stem">{isUnlocked ? stem : '????????'}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="music-player">
        <div className="music-now">
          <span className="music-now-label">{t('music.nowPlaying')}</span>
          <span className="music-now-title">
            {currentTitle ?? '—'}
          </span>
          {current && <span className="music-now-stem">{current}</span>}
        </div>
        <div className="music-transport">
          <div className="music-times">
            <span>{fmt(scrub ?? cur)}</span>
            <input
              className="music-seek"
              type="range"
              min={0}
              max={dur || 0}
              step={0.1}
              value={scrub ?? cur}
              disabled={!current}
              onChange={e => setScrub(Number(e.target.value))}
              onMouseUp={() => { if (scrub != null) player.currentTime = scrub; setScrub(null); }}
              onTouchEnd={() => { if (scrub != null) player.currentTime = scrub; setScrub(null); }}
            />
            <span>{fmt(dur)}</span>
          </div>
          <div className="music-buttons">
            <button
              className="music-btn"
              disabled={!current}
              onClick={() => step(-1)}
              title={t('music.prev')}
            >⏮</button>
            <button
              className="music-btn music-btn-main"
              disabled={!current}
              onClick={() => current && (playing ? player.pause() : player.play())}
              title={playing ? t('music.pause') : t('music.play')}
            >{playing ? '⏸' : '▶'}</button>
            <button
              className="music-btn"
              disabled={!current}
              onClick={() => step(1)}
              title={t('music.next')}
            >⏭</button>
            <button
              className="music-btn"
              disabled={!current}
              onClick={audio.stopBgm}
              title={t('music.stop')}
            >■</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MusicRoom;
