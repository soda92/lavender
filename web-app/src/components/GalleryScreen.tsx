import React, { useEffect, useMemo, useState } from 'react';
import { useT, type TKey } from '../game/i18n';
import { buildCgGroups, type CgGroup, type CgVariant } from '../game/cgGroups';
import {
  SCENE_HEROINES, isSceneUnlocked, sortScenes, type SceneEntry,
} from '../game/scenes';

interface Props {
  sf: Record<string, any>;
  onBack: () => void;
  initialViewMode?: 'cg' | 'scenes';
  onPlayScene?: (scene: SceneEntry) => void;
}

const PER_PAGE = 12;

const CATEGORY_ORDER = ['akina', 'haruka', 'hikaru', 'reika', 'riko', 'other'] as const;
const CAT_KEY: Record<string, TKey> = {
  all: 'gallery.catAll',
  akina: 'gallery.catAkina',
  haruka: 'gallery.catHaruka',
  hikaru: 'gallery.catHikaru',
  reika: 'gallery.catReika',
  riko: 'gallery.catRiko',
  other: 'gallery.catOther',
};

interface ViewerState { group: CgGroup; variants: CgVariant[]; idx: number }

const GalleryScreen: React.FC<Props> = ({ sf, onBack, initialViewMode = 'cg', onPlayScene }) => {
  const t = useT();
  const [viewMode, setViewMode] = useState<'cg' | 'scenes'>(initialViewMode);
  const [groups, setGroups] = useState<CgGroup[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [scenes, setScenes] = useState<SceneEntry[]>([]);
  const [sceneHeroine, setSceneHeroine] = useState<string>('all');
  // Spoiler guard: unlocked H-thumbnails stay blurred until explicitly
  // revealed (mirrors the reference gallery's sensitive-asset toggle).
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/media?dir=evimage')
      .then(r => r.json())
      .then((list: string[]) => setGroups(buildCgGroups(list.filter(p => /\.(png|jpg|jpeg)$/i.test(p)))));
    fetch('/api/scenes')
      .then(r => r.json())
      .then((list: SceneEntry[]) => setScenes(sortScenes(list)));
  }, []);

  const seen: Record<string, boolean> = sf.cgSeen || {};
  // The engine may have recorded the (identical) _l framing as seen instead.
  const isVariantSeen = (v: CgVariant) => !!seen[v.stem] || !!seen[`${v.stem}_l`];
  const unlockedVariants = (g: CgGroup) => g.variants.filter(isVariantSeen);

  const stats = useMemo(() => {
    const s: Record<string, { total: number; unlocked: number }> = { all: { total: 0, unlocked: 0 } };
    for (const c of CATEGORY_ORDER) s[c] = { total: 0, unlocked: 0 };
    for (const g of groups) {
      const open = unlockedVariants(g).length > 0;
      s.all.total++; if (open) s.all.unlocked++;
      if (s[g.category]) { s[g.category].total++; if (open) s[g.category].unlocked++; }
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, seen]);

  const sceneStats = useMemo(() => {
    const s: Record<string, { total: number; unlocked: number }> = { all: { total: 0, unlocked: 0 } };
    for (const h of SCENE_HEROINES) s[h] = { total: 0, unlocked: 0 };
    for (const sc of scenes) {
      const open = isSceneUnlocked(seen, sc);
      s.all.total++; if (open) s.all.unlocked++;
      if (s[sc.heroine]) { s[sc.heroine].total++; if (open) s[sc.heroine].unlocked++; }
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, seen]);

  const filteredScenes = useMemo(
    () => (sceneHeroine === 'all' ? scenes : scenes.filter(s => s.heroine === sceneHeroine)),
    [scenes, sceneHeroine],
  );

  const filtered = useMemo(
    () => (category === 'all' ? groups : groups.filter(g => g.category === category)),
    [groups, category],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  useEffect(() => { setPage(1); }, [category]);

  const openGroup = (g: CgGroup) => {
    const variants = unlockedVariants(g);
    if (variants.length) setViewer({ group: g, variants, idx: 0 });
  };
  const stepViewer = (d: number) => setViewer(v => {
    if (!v) return v;
    const idx = v.idx + d;
    // Clicking past the last variant closes the viewer (matches the engine).
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

  const cur = viewer && viewer.variants[viewer.idx];
  const curStats = viewMode === 'cg' ? stats[category] : sceneStats[sceneHeroine];

  const toggleReveal = (id: string) =>
    setRevealed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="extras-screen">
      <div className="extras-head">
        <div className="gallery-tabs">
          <button
            className={viewMode === 'cg' ? 'on' : ''}
            onClick={() => setViewMode('cg')}
          >{t('gallery.tabCg')}</button>
          <button
            className={viewMode === 'scenes' ? 'on' : ''}
            onClick={() => setViewMode('scenes')}
          >{t('gallery.tabScenes')}</button>
        </div>
        <span className="extras-count">{curStats?.unlocked ?? 0} / {curStats?.total ?? 0}</span>
        <button onClick={onBack}>{t('gallery.toTitle')}</button>
      </div>

      {viewMode === 'cg' ? (<>
        <div className="gallery-cats">
          {(['all', ...CATEGORY_ORDER] as const).map(c => (
            <button
              key={c}
              className={`gallery-cat ${category === c ? 'on' : ''}`}
              onClick={() => setCategory(c)}
            >
              {t(CAT_KEY[c])}
              <span className="gallery-cat-n">{stats[c]?.unlocked ?? 0}/{stats[c]?.total ?? 0}</span>
            </button>
          ))}
        </div>

        {pageCount > 1 && (
          <div className="gallery-pages">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map(n => (
              <button key={n} className={`gallery-page ${safePage === n ? 'on' : ''}`} onClick={() => setPage(n)}>{n}</button>
            ))}
          </div>
        )}

        <div className="gallery-grid gallery-paged">
          {pageItems.map(g => {
            const variants = unlockedVariants(g);
            const isOpen = variants.length > 0;
            return (
              <div
                key={g.id}
                className={`gallery-cell ${isOpen ? '' : 'locked'}`}
                onClick={() => openGroup(g)}
              >
                {isOpen
                  ? <>
                      <img src={variants[0].url} alt={g.id} loading="lazy" />
                      {g.variants.length > 1 && (
                        <span className="gallery-badge" title={t('gallery.variantsTitle', { n: g.variants.length })}>
                          {g.variants.length}
                        </span>
                      )}
                    </>
                  : <div className="lock-mark">🔒</div>}
              </div>
            );
          })}
        </div>
      </>) : (<>
        <div className="gallery-cats">
          {(['all', ...SCENE_HEROINES] as const).map(h => (
            <button
              key={h}
              className={`gallery-cat ${sceneHeroine === h ? 'on' : ''}`}
              onClick={() => setSceneHeroine(h)}
            >
              {h === 'all' ? t('gallery.catAll') : t(CAT_KEY[h])}
              <span className="gallery-cat-n">{sceneStats[h]?.unlocked ?? 0}/{sceneStats[h]?.total ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="scene-grid">
          {filteredScenes.map(sc => {
            const open = isSceneUnlocked(seen, sc);
            const isRevealed = revealed.has(sc.id);
            return (
              <div key={sc.id} className={`scene-card ${open ? '' : 'locked'}`}>
                <div
                  className="scene-thumb"
                  onClick={() => open && toggleReveal(sc.id)}
                  title={open && !isRevealed ? t('gallery.reveal') : sc.storage}
                >
                  {open
                    ? <>
                        <img
                          src={sc.thumb}
                          alt={sc.orig}
                          loading="lazy"
                          className={isRevealed ? '' : 'blurred'}
                        />
                        {!isRevealed && <span className="scene-veil">🔞</span>}
                      </>
                    : <div className="lock-mark">🔒</div>}
                </div>
                <div className="scene-meta">
                  <div className="scene-tags">
                    <span className="scene-heroine">{t(CAT_KEY[sc.heroine] ?? 'gallery.catOther')}</span>
                    <span className="scene-file">{sc.storage}</span>
                  </div>
                  <button
                    className="scene-play"
                    title={!open ? t('gallery.replayLocked') : undefined}
                    onClick={() => onPlayScene?.(sc)}
                  >
                    ▶ {t('gallery.replay')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </>)}

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
          <img className="cg-zoom" src={cur.url} alt={cur.stem} onClick={e => e.stopPropagation()} draggable={false} />
          {viewer.variants.length > 1 && (
            <div className="cg-viewer-bar" onClick={e => e.stopPropagation()}>
              <button onClick={() => stepViewer(-1)} disabled={viewer.idx === 0}>{t('gallery.prev')}</button>
              <span>{viewer.idx + 1} / {viewer.variants.length}</span>
              <button onClick={() => stepViewer(1)}>{t('gallery.next')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GalleryScreen;
