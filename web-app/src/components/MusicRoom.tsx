import React, { useEffect, useState } from 'react';
import { useT } from '../game/i18n';

interface Props {
  onBack: () => void;
  audio: {
    playBgm: (s: string) => void;
    stopBgm: () => void;
    bgmPlayer: HTMLAudioElement;
  };
}

const MusicRoom: React.FC<Props> = ({ onBack, audio }) => {
  const t = useT();
  const [tracks, setTracks] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/media?dir=bgm')
      .then(r => r.json())
      .then((list: string[]) => setTracks(list.filter(p => /\.ogg$/i.test(p)).sort()));
  }, []);

  useEffect(() => {
    const onPlay = () => {
      const stem = (audio.bgmPlayer as any).dataset?.stem || audio.bgmPlayer.src;
      setCurrent(stem);
    };
    const onPause = () => setCurrent(null);
    audio.bgmPlayer.addEventListener('play', onPlay);
    audio.bgmPlayer.addEventListener('pause', onPause);
    return () => {
      audio.bgmPlayer.removeEventListener('play', onPlay);
      audio.bgmPlayer.removeEventListener('pause', onPause);
    };
  }, [audio.bgmPlayer]);

  return (
    <div className="extras-screen">
      <div className="extras-head">
        <h2>{t('music.title')}</h2>
        <span className="extras-count">{t('music.trackCount', { n: tracks.length })}</span>
        <button onClick={() => { audio.stopBgm(); onBack(); }}>{t('gallery.toTitle')}</button>
      </div>
      <div className="music-list">
        {tracks.map(url => {
          const file = url.split('/').pop()!;
          const stem = file.replace(/\.ogg$/i, '');
          const playing = audio.bgmPlayer.src.endsWith(url) && !audio.bgmPlayer.paused;
          return (
            <div key={url} className={`music-row ${playing ? 'playing' : ''}`}>
              <span className="music-name">{stem}</span>
              <button onClick={() => audio.playBgm(url)}>{t('music.play')}</button>
              <button onClick={audio.stopBgm}>{t('music.stop')}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MusicRoom;
