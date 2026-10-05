import React, { useEffect, useMemo, useState } from 'react';
import { useT } from '../game/i18n';

interface Props {
  sf: Record<string, any>;
  onBack: () => void;
}

const stemOf = (url: string) => url.split('/').pop()!.replace(/\.[^.]+$/, '');

const GalleryScreen: React.FC<Props> = ({ sf, onBack }) => {
  const t = useT();
  const [images, setImages] = useState<string[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/media?dir=evimage')
      .then(r => r.json())
      .then((list: string[]) => setImages(list.filter(p => /\.(png|jpg|jpeg)$/i.test(p))));
  }, []);

  // Event CGs ship as a base image plus an optional "_l" framing variant of
  // the same still. Show one tile per CG: drop *_l whose base is also in the
  // list, keeping orphans that only exist as *_l.
  const cgs = useMemo(() => {
    const stems = new Set(images.map(stemOf));
    return images.filter(url => {
      const stem = stemOf(url);
      if (/_l$/.test(stem) && stems.has(stem.slice(0, -2))) return false;
      return true;
    });
  }, [images]);

  const seen = sf.cgSeen || {};
  // Seen flags are recorded under whichever variant the script displayed.
  const unlocked = (stem: string) =>
    !!seen[stem] || !!seen[`${stem}_l`] || (/_l$/.test(stem) && !!seen[stem.slice(0, -2)]);
  const unlockedCount = cgs.filter(url => unlocked(stemOf(url))).length;

  return (
    <div className="extras-screen">
      <div className="extras-head">
        <h2>{t('gallery.title')}</h2>
        <span className="extras-count">{unlockedCount} / {cgs.length}</span>
        <button onClick={onBack}>{t('gallery.toTitle')}</button>
      </div>
      <div className="gallery-grid">
        {cgs.map(url => {
          const stem = stemOf(url);
          const isOpen = unlocked(stem);
          return (
            <div
              key={url}
              className={`gallery-cell ${isOpen ? '' : 'locked'}`}
              onClick={() => isOpen && setZoom(url)}
            >
              {isOpen
                ? <img src={url} alt={stem} loading="lazy" />
                : <div className="lock-mark">🔒</div>}
            </div>
          );
        })}
      </div>
      {zoom && (
        <div className="modal-overlay" onClick={() => setZoom(null)}>
          <img className="cg-zoom" src={zoom} alt="" />
        </div>
      )}
    </div>
  );
};

export default GalleryScreen;
