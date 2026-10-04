import React, { useEffect, useState } from 'react';

interface Props {
  sf: Record<string, any>;
  onBack: () => void;
}

const GalleryScreen: React.FC<Props> = ({ sf, onBack }) => {
  const [images, setImages] = useState<string[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/media?dir=evimage')
      .then(r => r.json())
      .then((list: string[]) => setImages(list.filter(p => /\.(png|jpg|jpeg)$/i.test(p))));
  }, []);

  const seen = sf.cgSeen || {};
  const unlockedCount = images.filter(p => seen[p.split('/').pop()!.replace(/\.[^.]+$/, '')]).length;

  return (
    <div className="extras-screen">
      <div className="extras-head">
        <h2>CG 鑑賞</h2>
        <span className="extras-count">{unlockedCount} / {images.length}</span>
        <button onClick={onBack}>タイトルへ</button>
      </div>
      <div className="gallery-grid">
        {images.map(url => {
          const stem = url.split('/').pop()!.replace(/\.[^.]+$/, '');
          const unlocked = !!seen[stem];
          return (
            <div
              key={url}
              className={`gallery-cell ${unlocked ? '' : 'locked'}`}
              onClick={() => unlocked && setZoom(url)}
            >
              {unlocked
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
