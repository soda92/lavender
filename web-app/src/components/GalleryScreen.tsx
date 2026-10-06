import React, { useEffect, useMemo, useState } from 'react';
import { useT } from '../game/i18n';
import {
  GALLERY_SECTIONS, buildFallbackSections, normalizeSections,
  overlayUrl, type CgSection, type CgTile, type CgVariant,
} from '../game/cgGroups';
import { isSceneUnlocked, sortScenes, type SceneEntry } from '../game/scenes';
import { CG_MEMORY, SOUND_SKIN } from '../game/skin';
import SoundMode from './SoundMode';

export type GalleryMode = 'cg' | 'scenes' | 'music';

interface AudioLike {
  playBgm: (s: string) => void;
  stopBgm: () => void;
  bgmPlayer: HTMLAudioElement;
}

interface Props {
  sf: Record<string, any>;
  onBack: () => void;
  audio: AudioLike;
  initialViewMode?: GalleryMode;
  onPlayScene?: (scene: SceneEntry) => void;
}

interface ViewerState { tile: CgTile; variants: CgVariant[]; idx: number }

/** CSV rects use x/y/w/h; React inline styles want left/top/width/height. */
const pos = (r: { x: number; y: number; w?: number; h: number }) => ({
  left: r.x, top: r.y, width: r.w, height: r.h,
});

const GalleryScreen: React.FC<Props> = ({ sf, onBack, audio, initialViewMode = 'cg', onPlayScene }) => {
  const t = useT();
  const [mode, setMode] = useState<GalleryMode>(initialViewMode);
  const [sections, setSections] = useState<CgSection[]>([]);
  const [scenes, setScenes] = useState<SceneEntry[]>([]);
  const [tab, setTab] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  // Spoiler guard: unlocked scene thumbnails stay blurred until explicitly
  // revealed (modern addition on top of the authentic album).
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch('/api/cglist')
      .then(r => r.json())
      .then(d => {
        const norm = normalizeSections(d);
        if (!cancelled) {
          if (norm.some(s => s.tiles.length)) { setSections(norm); return; }
          // Empty / unavailable index: fall back to filename grouping.
          return fetch('/api/media?dir=evimage')
            .then(r => r.json())
            .then((list: string[]) =>
              !cancelled && setSections(buildFallbackSections(
                list.filter((p: string) => /\.(png|jpg|jpeg)$/i.test(p)))));
        }
      })
      .catch(() => { if (!cancelled) setSections([]); });
    fetch('/api/scenes')
      .then(r => r.json())
      .then((list: SceneEntry[]) => !cancelled && setScenes(sortScenes(list)));
    return () => { cancelled = true; };
  }, []);

  // Switching the mode / character tab restarts paging.
  useEffect(() => { setPage(1); }, [mode, tab]);

  const seen: Record<string, boolean> = sf.cgSeen || {};
  const isVariantSeen = (v: CgVariant) => !!seen[v.stem] || !!seen[`${v.stem}_l`];
  const tileUnlocked = (tile: CgTile) => tile.variants.some(isVariantSeen);
  const unlockedTiles = (list: CgTile[]) => list.filter(tileUnlocked);

  const sectionMap = useMemo(() => new Map(sections.map(s => [s.id, s])), [sections]);

  // --- CG mode data -------------------------------------------------------
  const cgTiles = useMemo(
    () => tab === 'all'
      ? sections.flatMap(s => s.tiles)
      : sectionMap.get(tab)?.tiles ?? [],
    [sections, tab, sectionMap],
  );

  // --- Scene mode data ----------------------------------------------------
  const sceneList = useMemo(
    () => (tab === 'all' || tab === 'other'
      ? scenes
      : scenes.filter(s => s.heroine === tab)),
    [scenes, tab],
  );

  const perPage = mode === 'cg' ? CG_MEMORY.cg.perPage : CG_MEMORY.scene.perPage;
  const pageItems = mode === 'cg' ? cgTiles : sceneList;
  const pageCount = Math.max(1, Math.ceil(pageItems.length / perPage));
  const safePage = Math.min(page, pageCount);
  const pageSlice = pageItems.slice((safePage - 1) * perPage, safePage * perPage);

  const countFor = (id: string): { unlocked: number; total: number } => {
    if (mode === 'cg') {
      const list = id === 'all' ? cgTilesBase(sections) : sectionMap.get(id)?.tiles ?? [];
      return { unlocked: unlockedTiles(list).length, total: list.length };
    }
    const list = id === 'all' ? scenes : scenes.filter(s => s.heroine === id);
    return { unlocked: list.filter(s => isSceneUnlocked(seen, s)).length, total: list.length };
  };
  const currentCount = countFor(tab);

  const openTile = (tile: CgTile) => {
    if (!tileUnlocked(tile)) return;
    // Keep ALL variant slots in the viewer: unseen positions render as a
    // locked placeholder, so a 4-variant tile with 1 seen shows 1/4 rather
    // than a one-frame viewer that closes on the next click.
    const firstSeen = tile.variants.findIndex(isVariantSeen);
    setViewer({ tile, variants: tile.variants, idx: Math.max(0, firstSeen) });
  };
  const stepViewer = (d: number) => setViewer(v => {
    if (!v) return v;
    const idx = v.idx + d;
    // Clicking past the last variant returns to the grid (engine behavior).
    if (idx >= v.variants.length) return null;
    return { ...v, idx: Math.max(0, idx) };
  });

  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewer(null);
      else if (e.key === 'ArrowLeft') stepViewer(-1);
      else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); stepViewer(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer]);

  const cur = viewer?.variants[viewer.idx];
  const curLocked = cur ? !isVariantSeen(cur) : false;

  // Pager: engine shows four numbered slots at a time.
  const groupSize = CG_MEMORY.pager.groupSize;
  const groupStart = Math.floor((safePage - 1) / groupSize) * groupSize + 1;
  const groupSlots = Array.from(
    { length: Math.min(groupSize, pageCount - groupStart + 1) },
    (_, i) => groupStart + i);

  const toggleReveal = (id: string) =>
    setRevealed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const modeBtn = CG_MEMORY.modeBtn;
  // Each mode shows tiles switching to the OTHER two; the sound screen uses
  // its own sound.csv button art (same geometry).
  const switchButtons =
    mode === 'cg' ? [
      { skin: CG_MEMORY.toScene, go: () => setMode('scenes'), idx: 0 },
      { skin: CG_MEMORY.toSound, go: () => setMode('music'), idx: 1 },
    ] : mode === 'scenes' ? [
      { skin: CG_MEMORY.toCg, go: () => setMode('cg'), idx: 0 },
      { skin: CG_MEMORY.toSound, go: () => setMode('music'), idx: 1 },
    ] : [
      { skin: SOUND_SKIN.toScene, go: () => setMode('scenes'), idx: 0 },
      { skin: SOUND_SKIN.toCg, go: () => setMode('cg'), idx: 1 },
    ];

  const goBack = () => {
    if (mode === 'music') audio.stopBgm();
    onBack();
  };

  return (
    <div className="cgmem">
      <img
        className="cgmem-base"
        src={mode === 'music' ? SOUND_SKIN.base : CG_MEMORY.base}
        alt="" draggable={false}
      />

      {/* Title */}
      {mode === 'music' ? (
        <img className="cgmem-title" src={SOUND_SKIN.title}
          style={pos(SOUND_SKIN.titleRect)} alt="" draggable={false} />
      ) : (
        <img
          className="cgmem-title"
          src={mode === 'cg' ? CG_MEMORY.titleCg : CG_MEMORY.titleScene}
          style={pos(mode === 'cg' ? CG_MEMORY.titleRects.cg : CG_MEMORY.titleRects.scene)}
          alt="" draggable={false}
        />
      )}

      {/* Mode switches */}
      {switchButtons.map((b, i) => (
        <button
          key={i}
          className="cgmem-modebtn"
          style={{ left: modeBtn.x[b.idx], top: modeBtn.y, width: modeBtn.w, height: modeBtn.h }}
          onClick={b.go}
        >
          <img src={b.skin.off} alt="" draggable={false} />
          <img src={b.skin.over} alt="" draggable={false} className="hov" />
        </button>
      ))}

      {/* Back */}
      <button
        className="cgmem-back"
        style={pos(CG_MEMORY.backRect)}
        onClick={goBack}
        title={t('gallery.toTitle')}
      >
        <img src={mode === 'music' ? SOUND_SKIN.back.off : CG_MEMORY.back.off} alt="" draggable={false} />
        <img src={mode === 'music' ? SOUND_SKIN.back.over : CG_MEMORY.back.over} alt="" draggable={false} className="hov" />
      </button>

      {mode === 'music' ? (
        <SoundMode audio={audio} seen={sf.bgmSeen} />
      ) : (<>
      {/* All view toggle (no shipped bitmap; sits by the pager rule) */}
      <button
        className={`cgmem-all ${tab === 'all' ? 'on' : ''}`}
        onClick={() => setTab('all')}
      >{t('gallery.catAll')}</button>
      <img
        className="cgmem-rail"
        src={CG_MEMORY.rail.normal}
        style={pos(CG_MEMORY.rail.frame)}
        alt="" draggable={false}
      />
      {GALLERY_SECTIONS.map((id, i) => {
        const r = CG_MEMORY.rail.rows[i];
        const disabled = mode === 'scenes' && (id === 'other' || !scenes.some(s => s.heroine === id));
        const active = tab === id;
        const c = countFor(id);
        return (
          <button
            key={id}
            className={`cgmem-tab ${active ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
            style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
            disabled={disabled}
            onClick={() => !disabled && setTab(id)}
            title={t(`gallery.cat${id[0].toUpperCase()}${id.slice(1)}` as any)}
          >
            <span
              className="cgmem-tab-crop over"
              style={{
                backgroundImage: `url(${CG_MEMORY.rail.over})`,
                backgroundPositionY: -r.cropY,
              } as React.CSSProperties}
            />
            <span
              className="cgmem-tab-crop on"
              style={{
                backgroundImage: `url(${CG_MEMORY.rail.on})`,
                backgroundPositionY: -r.cropY,
              } as React.CSSProperties}
            />
            <span className="cgmem-tab-n">{c.unlocked}/{c.total}</span>
          </button>
        );
      })}

      {/* Grid */}
      {mode === 'cg' ? (
        <div className="cgmem-grid">
          {CG_MEMORY.cg.origins.map((rect, i) => {
            const tile = pageSlice[i] as CgTile | undefined;
            if (!tile) return null;
            const open = tileUnlocked(tile);
            const seenCount = tile.variants.filter(isVariantSeen).length;
            const partial = tile.variants.length > 1 && seenCount < tile.variants.length;
            return (
              <button
                key={tile.id}
                className={`cgmem-cell ${open ? '' : 'locked'}`}
                style={pos(rect)}
                onClick={() => openTile(tile)}
              >
                {open ? <>
                  <img className="cgmem-frame" src={CG_MEMORY.cg.frameOff} alt="" draggable={false} />
                  <img className="cgmem-frame hov" src={CG_MEMORY.cg.frameOver} alt="" draggable={false} />
                  <img className="cgmem-thumb" src={tile.thumb}
                    style={pos(CG_MEMORY.cg.thumb)} alt={tile.id} loading="lazy" draggable={false} />
                  {tile.variants.length > 1 && (
                    <span
                      className={`cgmem-badge${partial ? ' partial' : ''}`}
                      title={partial
                        ? t('gallery.variantsPartial', { seen: seenCount, n: tile.variants.length })
                        : t('gallery.variantsTitle', { n: tile.variants.length })}
                    >
                      {partial ? `${seenCount}/${tile.variants.length}` : tile.variants.length}
                    </span>
                  )}
                </> : (
                  <img className="cgmem-thumb" src={CG_MEMORY.cg.locked}
                    style={pos(CG_MEMORY.cg.thumb)} alt="" draggable={false} />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="cgmem-scenes">
          {CG_MEMORY.scene.origins.map((rect, i) => {
            const sc = pageSlice[i] as SceneEntry | undefined;
            if (!sc) return null;
            const open = isSceneUnlocked(seen, sc);
            const isRevealed = revealed.has(sc.id);
            return (
              <button
                key={sc.id}
                className={`cgmem-cell cgmem-cell-scene ${open ? '' : 'locked'}`}
                style={{ left: rect.x, top: rect.y, width: 250, height: 190 }}
                onClick={() => onPlayScene?.(sc)}
                title={open ? t('gallery.replay') : t('gallery.replayLocked')}
              >
                {open ? <>
                  <img className="cgmem-frame" src={CG_MEMORY.scene.frameOff} alt="" draggable={false} />
                  <img className="cgmem-frame hov" src={CG_MEMORY.scene.frameOver} alt="" draggable={false} />
                  <img
                    className={`cgmem-thumb ${isRevealed ? '' : 'blurred'}`}
                    src={sc.thumb}
                    style={pos(CG_MEMORY.scene.thumb)}
                    alt={sc.orig} loading="lazy" draggable={false}
                  />
                  {!isRevealed && (
                    <span
                      className="cgmem-veil"
                      title={t('gallery.reveal')}
                      onClick={e => { e.stopPropagation(); toggleReveal(sc.id); }}
                    >🔞</span>
                  )}
                </> : (
                  <img className="cgmem-thumb" src={CG_MEMORY.scene.locked}
                    style={pos(CG_MEMORY.scene.thumb)} alt="" draggable={false} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Pager (four engine slots per group, arrows when the list spans groups) */}
      {pageCount > 1 && (
        <div className="cgmem-pager" style={{ left: CG_MEMORY.pager.x, top: CG_MEMORY.pager.y }}>
          {groupStart > 1 && (
            <button className="cgmem-page-step" style={{ left: -22 }}
              onClick={() => setPage(groupStart - 1)}>◀</button>
          )}
          {groupSlots.map(n => (
            <button
              key={n}
              className={`cgmem-page ${safePage === n ? 'on' : ''}`}
              style={{ left: (n - groupStart) * CG_MEMORY.pager.pitch, width: CG_MEMORY.pager.w, height: CG_MEMORY.pager.h }}
              onClick={() => setPage(n)}
            >
              <span className="tri">▼</span>
              <span className="num">{((n - 1) % groupSize) + 1}</span>
            </button>
          ))}
          {groupStart + groupSize - 1 < pageCount && (
            <button className="cgmem-page-step"
              style={{ left: (groupSlots.length * CG_MEMORY.pager.pitch) }}
              onClick={() => setPage(groupStart + groupSize)}>▶</button>
          )}
        </div>
      )}

      <span className="cgmem-count">{currentCount.unlocked} / {currentCount.total}</span>
      </>)}

      {/* Fullscreen variant viewer */}
      {viewer && cur && (
        <div className="cg-viewer" onClick={() => stepViewer(1)}>
          <button
            className="cg-viewer-x"
            onClick={e => { e.stopPropagation(); setViewer(null); }}
          >×</button>
          {viewer.idx > 0 && (
            <button className="cg-viewer-nav prev" onClick={e => { e.stopPropagation(); stepViewer(-1); }}>‹</button>
          )}
          {viewer.idx < viewer.variants.length - 1 && (
            <button className="cg-viewer-nav next" onClick={e => { e.stopPropagation(); stepViewer(1); }}>›</button>
          )}
          <div className="cg-viewer-stage">
            {curLocked ? (
              <div className="cg-zoom-locked">
                <span className="q">？？？？</span>
                <span className="sub">{t('gallery.lockedFrame')}</span>
              </div>
            ) : (<>
              <img className="cg-zoom" src={cur.url} alt={cur.stem} draggable={false} />
              {cur.overlay && (
                <img className="cg-zoom-overlay" src={overlayUrl(cur.overlay)} alt="" draggable={false} />
              )}
            </>)}
          </div>
          {viewer.variants.length > 1 && (
            <div className="cg-viewer-bar" onClick={e => e.stopPropagation()}>
              <button onClick={() => stepViewer(-1)} disabled={viewer.idx === 0}>{t('gallery.prev')}</button>
              <span className={curLocked ? 'locked' : ''}>
                {curLocked && '🔒 '}{viewer.idx + 1} / {viewer.variants.length}
              </span>
              <button onClick={() => stepViewer(1)}>
                {viewer.idx === viewer.variants.length - 1 ? t('gallery.endScene') : t('gallery.next')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** All tiles across sections in shipped order. */
function cgTilesBase(sections: CgSection[]): CgTile[] {
  return sections.flatMap(s => s.tiles);
}

export default GalleryScreen;
