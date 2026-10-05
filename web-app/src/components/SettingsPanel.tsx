import React from 'react';

interface Props {
  runner: any;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="settings-row">
    <span>{label}</span>
    <div>{children}</div>
  </div>
);

/** Settings tab body (rendered inside <SidePanel>). */
const SettingsTab: React.FC<Props> = ({ runner }) => {
  const sf = runner.sf || {};
  const set = (patch: Record<string, any>) => runner.setSf((prev: any) => ({ ...prev, ...patch }));

  return (
    <div className="side-body settings-body">
      <Row label="BGM 音量">
        <input type="range" min={0} max={10} value={sf.vol ?? 8}
          onChange={e => set({ vol: Number(e.target.value) })} />
        <span className="val">{sf.vol ?? 8}</span>
      </Row>
      <Row label="効果音・ボイス音量">
        <input type="range" min={0} max={10} value={sf.sevol ?? 8}
          onChange={e => set({ sevol: Number(e.target.value) })} />
        <span className="val">{sf.sevol ?? 8}</span>
      </Row>
      <Row label="文字スピード">
        <input type="range" min={1} max={8} value={sf.textSpeed ?? 2}
          onChange={e => set({ textSpeed: Number(e.target.value) })} />
        <span className="val">{sf.textSpeed ?? 2}</span>
      </Row>
      <Row label="オート待ち時間">
        <input type="range" min={30} max={200} value={sf.autoSpeed ?? 90}
          onChange={e => set({ autoSpeed: Number(e.target.value) })} />
      </Row>
      <Row label="スキップ対象">
        <select
          value={sf.skipMode ?? 'ALL'}
          onChange={e => set({ skipMode: e.target.value })}
        >
          <option value="ALL">すべて</option>
          <option value="READ_ONLY">既読のみ</option>
        </select>
      </Row>
      <Row label="言語（テキスト）">
        <select value={runner.language} onChange={e => runner.setLanguage(e.target.value)}>
          <option value="JP">日本語</option>
          <option value="EN">English（日本語フォールバック）</option>
        </select>
      </Row>

      <div className="settings-hint">
        ショートカット：Enter 次へ / J オート / K スキップ / Ctrl+S クイックセーブ / Ctrl+L ロード
      </div>
    </div>
  );
};

export default SettingsTab;
