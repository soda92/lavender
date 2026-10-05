import React from 'react';
import type { HistoryItem } from '../hooks/useKagRunner';
import { useT } from '../game/i18n';

interface Props {
  items: HistoryItem[];
  onReplayVoice: (stem: string) => void;
}

/** Backlog tab body (rendered inside <SidePanel>). */
const HistoryTab: React.FC<Props> = ({ items, onReplayVoice }) => {
  const t = useT();
  return (
    <div className="side-body">
      <div className="history-list">
        {[...items].reverse().map((it, i) => (
          <div className="history-item" key={items.length - i}>
            {it.speaker && <span className="history-speaker">{it.speaker}</span>}
            <span className="history-text">{it.text}</span>
            {it.voice && (
              <button className="voice-btn" onClick={() => onReplayVoice(it.voice)}>🔊</button>
            )}
          </div>
        ))}
        {items.length === 0 && <div className="empty-hint">{t('history.empty')}</div>}
      </div>
    </div>
  );
};

export default HistoryTab;
