import React, { useState } from 'react';
import { useI18n, useT } from '../game/i18n';

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
  const t = useT();
  const { lang, setLang } = useI18n();
  const [confirmExit, setConfirmExit] = useState(false);
  const sf = runner.sf || {};
  const set = (patch: Record<string, any>) => runner.setSf((prev: any) => ({ ...prev, ...patch }));
  const playing = runner.gameState === 'PLAYING';

  return (
    <div className="side-body settings-body">
      <Row label={t('settings.displayMode')}>
        <button
          className={`seg-btn ${!sf.immerseMode ? 'on' : ''}`}
          onClick={() => set({ immerseMode: false })}
        >{t('settings.normal')}</button>
        <button
          className={`seg-btn ${sf.immerseMode ? 'on' : ''}`}
          onClick={() => set({ immerseMode: true })}
        >{t('settings.immersive')}</button>
      </Row>
      <Row label={t('settings.bgmVolume')}>
        <input type="range" min={0} max={10} value={sf.vol ?? 8}
          onChange={e => set({ vol: Number(e.target.value) })} />
        <span className="val">{sf.vol ?? 8}</span>
      </Row>
      <Row label={t('settings.seVolume')}>
        <input type="range" min={0} max={10} value={sf.sevol ?? 8}
          onChange={e => set({ sevol: Number(e.target.value) })} />
        <span className="val">{sf.sevol ?? 8}</span>
      </Row>
      <Row label={t('settings.textSpeed')}>
        <input type="range" min={1} max={8} value={sf.textSpeed ?? 2}
          onChange={e => set({ textSpeed: Number(e.target.value) })} />
        <span className="val">{sf.textSpeed ?? 2}</span>
      </Row>
      <Row label={t('settings.autoWait')}>
        <input type="range" min={30} max={200} value={sf.autoSpeed ?? 90}
          onChange={e => set({ autoSpeed: Number(e.target.value) })} />
      </Row>
      <Row label={t('settings.skipTarget')}>
        <select
          value={sf.skipMode ?? 'ALL'}
          onChange={e => set({ skipMode: e.target.value })}
        >
          <option value="ALL">{t('settings.all')}</option>
          <option value="READ_ONLY">{t('settings.readOnly')}</option>
        </select>
      </Row>
      <Row label={t('settings.uiLanguage')}>
        <select value={lang} onChange={e => setLang(e.target.value as 'ja' | 'en')}>
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
      </Row>
      <Row label={t('settings.textLanguage')}>
        <select value={runner.language} onChange={e => runner.setLanguage(e.target.value)}>
          <option value="JP">日本語</option>
          <option value="EN">{t('settings.textLanguageEn')}</option>
        </select>
      </Row>

      {playing && (
        <div className="settings-exit">
          {confirmExit ? (
            <>
              <p className="settings-exit-warn">{t('settings.returnTitleWarn')}</p>
              <div className="settings-exit-btns">
                <button className="seg-btn" onClick={() => setConfirmExit(false)}>{t('common.cancel')}</button>
                <button
                  className="seg-btn danger"
                  onClick={() => { setConfirmExit(false); runner.returnToTitle(); }}
                >{t('settings.confirmReturn')}</button>
              </div>
            </>
          ) : (
            <button className="seg-btn danger settings-exit-btn" onClick={() => setConfirmExit(true)}>
              {t('settings.returnTitle')}
            </button>
          )}
        </div>
      )}

      <div className="settings-hint">
        {t('settings.shortcuts')}
      </div>
    </div>
  );
};

export default SettingsTab;
