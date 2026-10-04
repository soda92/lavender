import React from 'react';

interface SlotData {
  currentScenario?: string;
  pointer?: number;
  speaker?: string;
  dialogueText?: string;
  date?: string;
  pinned?: boolean;
  note?: string;
}

interface Props {
  mode: 'save' | 'load';
  slots: Record<string, any>;
  onSave?: (id: number) => void;
  onLoad: (slot: any) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}

const SavesModal: React.FC<Props> = ({ mode, slots, onSave, onLoad, onDelete, onClose }) => {
  const ids = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel saves-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{mode === 'save' ? 'セーブ' : 'ロード'}</h2>
          <button onClick={onClose}>閉じる</button>
        </div>
        <div className="saves-grid">
          {ids.map(id => {
            const s = slots[id];
            return (
              <div key={id} className={`save-cell ${s ? 'filled' : 'empty'}`}>
                <div className="save-cell-head">
                  <span>#{id + 1}</span>
                  {s?.pinned && <span title="pinned">📌</span>}
                </div>
                {s ? (
                  <>
                    <div className="save-meta">{s.date}</div>
                    <div className="save-scene">{s.currentScenario} : {s.pointer}</div>
                    <div className="save-preview">
                      {s.speaker && <b>{s.speaker}　</b>}
                      {(s.dialogueText || '').slice(0, 40)}
                    </div>
                    <div className="save-actions">
                      {mode === 'save'
                        ? <button onClick={() => onSave?.(id)}>上書き</button>
                        : <button onClick={() => onLoad(s)}>読込</button>}
                      <button className="danger" onClick={() => onDelete(id)}>消去</button>
                    </div>
                  </>
                ) : (
                  <div className="save-empty">
                    {mode === 'save'
                      ? <button onClick={() => onSave(id)}>ここに保存</button>
                      : '—'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {slots.autosave && (
          <div className="autosave-row">
            <span>オートセーブ</span>
            <span className="save-meta">{slots.autosave.date}</span>
            <button onClick={() => onLoad(slots.autosave as any)}>再開</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SavesModal;
