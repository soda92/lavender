import React, { useEffect, useState } from 'react';
import { DIALOG_SKIN, DIALOG_LABELS } from '../game/skin';

interface Props {
  kind: string;
  onAnswer: (yes: boolean) => void;
}

/**
 * dialog.csv confirmation popup: base (245,223 309x154), baked label art
 * for each ask kind (上書き/ロード/クイックセーブ/…), はい/いいえ buttons.
 * Esc or right click answers いいえ.
 */
const SkinDialog: React.FC<Props> = ({ kind, onAnswer }) => {
  const [hover, setHover] = useState<'yes' | 'no' | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onAnswer(false);
      if (e.key === 'Enter' || e.key === ' ') onAnswer(true);
    };
    const onCtx = (e: MouseEvent) => { e.preventDefault(); onAnswer(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', onCtx);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', onCtx);
    };
  }, [onAnswer]);

  const label = DIALOG_LABELS[kind];

  return (
    <div className="skin-dialog"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onContextMenu={e => e.stopPropagation()}>
      <img src={DIALOG_SKIN.base} alt="" draggable={false}
        style={{ position: 'absolute', left: 245, top: 223, width: 309, height: 154 }} />
      {label && (
        <img src={label} alt="" draggable={false}
          style={{ position: 'absolute', left: 400, top: 274, transform: 'translateX(-50%)', pointerEvents: 'none' }} />
      )}
      <button
        className="cfg-hit"
        style={{ position: 'absolute', left: 250, top: 336, width: 148, height: 34 }}
        onMouseEnter={() => setHover('yes')} onMouseLeave={() => setHover(null)}
        onClick={e => { e.currentTarget.blur(); onAnswer(true); }}
      >
        <img src={hover === 'yes' ? DIALOG_SKIN.yesOver : DIALOG_SKIN.yesOff}
          alt="" draggable={false} style={{ width: 148, height: 34, pointerEvents: 'none' }} />
      </button>
      <button
        className="cfg-hit"
        style={{ position: 'absolute', left: 401, top: 336, width: 148, height: 34 }}
        onMouseEnter={() => setHover('no')} onMouseLeave={() => setHover(null)}
        onClick={e => { e.currentTarget.blur(); onAnswer(false); }}
      >
        <img src={hover === 'no' ? DIALOG_SKIN.noOver : DIALOG_SKIN.noOff}
          alt="" draggable={false} style={{ width: 148, height: 34, pointerEvents: 'none' }} />
      </button>
    </div>
  );
};

export default SkinDialog;
