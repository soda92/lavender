import React, { useEffect, useMemo, useState } from 'react';
import { useT, type TKey } from '../game/i18n';
import { buildCgGroups, type CgGroup, type CgVariant } from '../game/cgGroups';

interface Props {
  sf: Record<string, any>;
  onBack: () => void;
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

const GalleryScreen: React.FC<Props> = ({ sf, onBack }) => {
  const t = useT();
  const [groups, setGroups] = useState<CgGroup[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [viewer, setViewer] = useState<ViewerState | null>(null);

  useEffect(() => {
    fetch('/api/media?dir=evimage')
      .then(r => r.json())
      .then((list: string[]) => setGroups(buildCgGroups(list.filter(p => /\.(png|jpg|jpeg)$/i.test(p)))));
  }, []);

  const seen: Record<string, boolean> = sf.cgSeen || {};
  const isVariantSeen = (v: CgVariant) =>
    !!seen[v.stem] || (v.isL && !!seen[v.stem.replace(/_l$/, '')]);
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

  return (
    <div className="extras-screen">
      <div className="extras-head">
        <h2>{t('gallery.title')}</h2>
        <span className="extras-count">{stats[category]?.unlocked ?? 0} / {stats[category]?.total ?? 0}</span>
        <button onClick={onBack}>{t('gallery.toTitle')}</button>
      </div>

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

      {viewer && cur && (
        <div className="cg-viewer" onClick={() => stepViewer(1)}>
          <button
            className="cg-viewer-x"
            onClick={e => { e.stopPropagation(); setViewer(null); }}
          >×</button>
          {viewer.idx > 0 && (
            <button className="cg-viewer-nav prev" onClick={e => { e.stopPropagation(); stepViewer(-1); }}>‹</button>
          )}
          <img className="cg-zoom" src={cur.url} alt={cur.stem} onClick={e => e.stopPropagation()} draggable={false} />
          <div className="cg-viewer-bar" onClick={e => e.stopPropagation()}>
            <button onClick={() => stepViewer(-1)} disabled={viewer.idx === 0}>{t('gallery.prev')}</button>
            <span>{viewer.idx + 1} / {viewer.variants.length}</span>
            <button onClick={() => stepViewer(1)}>{t('gallery.next')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GalleryScreen;
