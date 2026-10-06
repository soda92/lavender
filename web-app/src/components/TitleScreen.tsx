import React, { useEffect, useState } from 'react';
import { SKIN } from '../game/skin';

interface Props {
  onStart: () => void;
  onContinue: () => void;
  onGallery: () => void;
  onSettings: () => void;
  hasAutosave: boolean;
  playBgm: (stem: string) => void;
}

// title.csv rows: x=298 w=205, y=349/394/439/484/529 h=43 on an 800x600 stage
const MENU = [
  { id: 'start', label: 'Start' },
  { id: 'load', label: 'Load' },
  { id: 'config', label: 'Config' },
  { id: 'extra', label: 'Extra' },
  { id: 'exit', label: 'Exit' },
] as const;
const ROW_TOPS = [349, 394, 439, 484, 529];

const TitleScreen: React.FC<Props> = ({
  onStart, onContinue, onGallery, onSettings, hasAutosave, playBgm,
}) => {
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    // Title theme.
    playBgm('bgm01a');
  }, [playBgm]);

  const onPick = (id: string) => {
    switch (id) {
      case 'start': onStart(); break;
      case 'load': if (hasAutosave) onContinue(); break;
      case 'config': onSettings(); break;
      case 'extra': onGallery(); break;
      case 'exit':
        // Native game quits here; browsers usually block window.close().
        window.close();
        break;
    }
  };

  return (
    <div className="title-screen">
      <img className="title-bg-skin" src={SKIN.titleBg} alt="" draggable={false} />
      <img className="title-logo-skin" src={SKIN.titleLogo} alt="光輪の町、ラベンダーの少女" draggable={false} />

      {/* prerendered menu labels; the over frame adds leaves on hover */}
      <img className="title-menu-frame" src={SKIN.titleFrame} alt="" draggable={false} />
      {hover != null && (
        <img className="title-menu-frame over" src={SKIN.titleFrameOver} alt="" draggable={false} />
      )}

      {MENU.map((m, i) => (
        <button
          key={m.id}
          className="title-menu-btn"
          style={{ top: ROW_TOPS[i], cursor: m.id === 'load' && !hasAutosave ? 'default' : 'pointer' }}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          onClick={() => onPick(m.id)}
          aria-label={m.label}
        >
          {m.id === 'load' && !hasAutosave && <span className="title-row-dim" />}
        </button>
      ))}
    </div>
  );
};

export default TitleScreen;
