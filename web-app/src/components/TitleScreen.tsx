import React, { useEffect } from 'react';
import { mediaUrl } from '../game/metadata';
import { useT } from '../game/i18n';

interface Props {
  onStart: () => void;
  onContinue: () => void;
  onGallery: () => void;
  onMusic: () => void;
  hasAutosave: boolean;
  playBgm: (stem: string) => void;
}

const TitleScreen: React.FC<Props> = ({ onStart, onContinue, onGallery, onMusic, hasAutosave, playBgm }) => {
  const t = useT();
  useEffect(() => {
    // Title theme: bgm01 is the opening/title track.
    playBgm('bgm01a');
  }, [playBgm]);

  const logo = mediaUrl('titlelogo');

  return (
    <div className="title-screen">
      {logo && <img className="title-logo" src={logo} alt="光輪の町、ラベンダーの少女" />}
      <div className="title-menu">
        <button onClick={onStart}>{t('title.start')}</button>
        <button onClick={onContinue} disabled={!hasAutosave}>{t('title.continue')}</button>
        <button onClick={onGallery}>{t('title.gallery')}</button>
        <button onClick={onMusic}>{t('title.music')}</button>
      </div>
      <div className="title-foot">Akabeisoft2 / Lavender web player</div>
    </div>
  );
};

export default TitleScreen;
