import React from 'react';
import type { HistoryItem } from '../hooks/useKagRunner';

interface Props {
  items: HistoryItem[];
  onClose: () => void;
  onReplayVoice: (stem: string) => void;
}

const HistoryModal: React.FC<Props> = ({ items, onClose, onReplayVoice }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel history-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>バックログ</h2>
          <button onClick={onClose}>閉じる</button>
        </div>
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
          {items.length === 0 && <div className="empty-hint">履歴はありません</div>}
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;
