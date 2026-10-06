import React, { useEffect, useMemo, useState } from 'react';
import { useT } from '../game/i18n';
import { SOUND_SKIN } from '../game/skin';

interface Props {
  audio: {
    playBgm: (s: string) => void;
    stopBgm: () => void;
    bgmPlayer: HTMLAudioElement;
  };
  /** sf.bgmSeen: stems already heard in the game */
  seen?: Record<string, boolean | undefined>;
}

const pos = (r: { x: number; y: number; w?: number; h: number }) => ({
  left: r.x, top: r.y, width: r.w, height: r.h,
});

const naturalCmp = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const fmt = (sec: number) => {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Authentic sound.csv music room: numbered paper sheet, 20 white data rows
 * per page (two columns of ten), charcoal row for the current track. The
 * transport panel in the empty right half is a modern addition.
 */
const SoundMode: React.FC<Props> = ({ audio, seen }) => {
  const t = useT();
  const player = audio.bgmPlayer;

  const [titles, setTitles] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [page, setPage] = useState(1);

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

  const step = (dir: 1 | -1) => {
    const list = stems.filter(s => unlocked.has(s));
    if (!list.length) return;
    const idx = current ? list.indexOf(current) : -1;
    audio.playBgm(list[(idx + dir + list.length) % list.length]);
  };

  // Auto-advance through unlocked tracks when one finishes.
  useEffect(() => {
    const onEnded = () => step(1);
    player.addEventListener('ended', onEnded);
    return () => player.removeEventListener('ended', onEnded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, stems, current, unlocked]);

  const play = (stem: string) => {
    if (!unlocked.has(stem)) return;
    if (player.dataset.stem === stem && !player.paused) player.pause();
    else audio.playBgm(stem);
  };

  const pageCount = Math.max(1, Math.ceil(stems.length / SOUND_SKIN.perPage));
  const safePage = Math.min(page, pageCount);
  const pageStems = stems.slice(
    (safePage - 1) * SOUND_SKIN.perPage, safePage * SOUND_SKIN.perPage);
  const currentTitle = current ? titles[current] || current : null;
  const r = SOUND_SKIN.row;

  return (
    <>
      {/* numbered sheet (faint 01..20 / 21..40 grid baked in) */}
      <img
        className="cgmem-sheet"
        src={SOUND_SKIN.sheet.layers[safePage - 1]}
        style={pos(SOUND_SKIN.sheet)}
        alt="" draggable={false}
      />

      {pageStems.map((stem, i) => {
        const col = i >= r.perCol ? 1 : 0;
        const rowIdx = i % r.perCol;
        const isUnlocked = unlocked.has(stem);
        const isCurrent = current === stem;
        // A track started elsewhere (e.g. title BGM) shows its name while on.
        const reveal = isUnlocked || isCurrent;
        return (
          <button
            key={stem}
            className={`sound-row ${isCurrent ? 'on' : ''} ${isUnlocked ? '' : 'locked'}`}
            style={{ left: r.cols[col], top: r.y0 + rowIdx * r.pitch, width: r.w, height: r.h }}
            onClick={() => play(stem)}
            title={isUnlocked ? titles[stem] || stem : ''}
          >
            <img className="sound-row-f" src={SOUND_SKIN.rowOff} alt="" draggable={false} />
            <img className="sound-row-f hov" src={SOUND_SKIN.rowOver} alt="" draggable={false} />
            <img className="sound-row-f cur" src={SOUND_SKIN.rowOn} alt="" draggable={false} />
            <span className="sound-row-title">
              {reveal ? titles[stem] || stem : '？？？？'}
            </span>
          </button>
        );
      })}

      {/* pager */}
      {pageCount > 1 && (
        <div className="cgmem-pager" style={{ left: SOUND_SKIN.pager.x, top: SOUND_SKIN.pager.y }}>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              className={`cgmem-page ${safePage === n ? 'on' : ''}`}
              style={{
                left: SOUND_SKIN.pager.slotOffset + (n - 1) * SOUND_SKIN.pager.pitch,
                width: SOUND_SKIN.pager.w, height: SOUND_SKIN.pager.h,
              }}
              onClick={() => setPage(n)}
            >
              <span className="tri">▼</span>
              <span className="num">{n}</span>
            </button>
          ))}
        </div>
      )}

      <span className="cgmem-count" style={{ left: 200 }}>
        {unlocked.size} / {stems.length}
      </span>

      {/* modern transport panel in the empty right half */}
      <div className="sound-panel">
        <div className="sound-panel-label">
          {t('music.nowPlaying')}
          {playing && <span className="sound-panel-eq"><i /><i /><i /></span>}
        </div>
        <div className="sound-panel-title">{currentTitle ?? '—'}</div>
        {current && <div className="sound-panel-stem">{current}</div>}

        <div className="sound-times">
          <span>{fmt(scrub ?? cur)}</span>
          <input
            className="sound-seek"
            type="range" min={0} max={dur || 0} step={0.1}
            value={scrub ?? cur}
            disabled={!current}
            onChange={e => setScrub(Number(e.target.value))}
            onMouseUp={() => { if (scrub != null) player.currentTime = scrub; setScrub(null); }}
            onTouchEnd={() => { if (scrub != null) player.currentTime = scrub; setScrub(null); }}
          />
          <span>{fmt(dur)}</span>
        </div>
        <div className="sound-buttons">
          <button disabled={!current} onClick={() => step(-1)} title={t('music.prev')}>⏮</button>
          <button className="main" disabled={!current}
            onClick={() => current && (playing ? player.pause() : player.play())}
            title={playing ? t('music.pause') : t('music.play')}
          >{playing ? '⏸' : '▶'}</button>
          <button disabled={!current} onClick={() => step(1)} title={t('music.next')}>⏭</button>
          <button disabled={!current} onClick={audio.stopBgm} title={t('music.stop')}>■</button>
        </div>
      </div>
    </>
  );
};

export default SoundMode;
