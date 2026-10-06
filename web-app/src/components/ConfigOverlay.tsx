import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CFG_DEFAULTS, CFG_VOICE_CHARS, cfgSoundUrl } from '../game/skin';
import { useI18n, type TKey } from '../game/i18n';

interface Props {
  runner: any;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

/** CSS slider: track + fill + round knob, same drag semantics as the engine. */
const Slider: React.FC<{
  value: number; max?: number; disabled?: boolean;
  onChange: (v: number) => void;
}> = ({ value, max = 255, disabled, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const ratio = clamp01(value / max);

  const setFromClient = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onChange(Math.round(clamp01((clientX - r.left) / r.width) * max));
  }, [max, onChange]);

  useEffect(() => {
    const move = (e: PointerEvent) => { if (dragRef.current) setFromClient(e.clientX); };
    const up = () => { dragRef.current = false; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [setFromClient]);

  return (
    <div className={`cfg-slider${disabled ? ' is-disabled' : ''}`}>
      <div
        ref={trackRef}
        className="cfg-slider-track"
        onPointerDown={e => {
          if (disabled) return;
          dragRef.current = true;
          setFromClient(e.clientX);
        }}
      >
        <div className="cfg-slider-fill" style={{ width: `${ratio * 100}%` }} />
        <div className="cfg-slider-knob" style={{ left: `${ratio * 100}%` }} />
      </div>
    </div>
  );
};

/** Two-pill radio (engine switch%cref replacement). */
const Segmented: React.FC<{
  value: any; a: { value: any; label: string }; b: { value: any; label: string };
  onChange: (v: any) => void;
}> = ({ value, a, b, onChange }) => (
  <div className="cfg-seg">
    {[a, b].map((opt, i) => (
      <button key={i}
        className={`cfg-seg-btn${value === opt.value ? ' is-on' : ''}`}
        onClick={e => { e.currentTarget.blur(); onChange(opt.value); }}>
        {opt.label}
      </button>
    ))}
  </div>
);

/** Checkbox + label (engine ask%cref / wide toggle replacement). */
const Check: React.FC<{
  checked: boolean; onChange: () => void; label: string;
}> = ({ checked, onChange, label }) => (
  <button className={`cfg-check${checked ? ' is-on' : ''}`}
    onClick={e => { e.currentTarget.blur(); onChange(); }}>
    <span className="cfg-check-box" aria-hidden="true" />
    <span className="cfg-check-label">{label}</span>
  </button>
);

/** JP label with the small EN sub-caption printed on the authentic sheet. */
const Label: React.FC<{ jp: string; en: string; dim?: boolean }> = ({ jp, en, dim }) => {
  const { lang } = useI18n();
  return (
    <div className={`cfg-lbl${dim ? ' is-dim' : ''}`}>
      <span className="cfg-lbl-jp">{jp}</span>
      {lang === 'ja' && en && <span className="cfg-lbl-en">{en}</span>}
    </div>
  );
};

const Section: React.FC<{
  title: string; sub: string; dark?: boolean; children: React.ReactNode;
}> = ({ title, sub, dark, children }) => {
  const { lang } = useI18n();
  // The JP sheet prints literal lowercase "system"/"text" headers;
  // capitalize them in the English UI.
  const head = lang === 'en' ? title.charAt(0).toUpperCase() + title.slice(1) : title;
  return (
    <section className={`cfg-sec${dark ? ' is-dark' : ''}`}>
      <h3 className="cfg-sec-head">
        <span>{head}</span>
        {sub && <span className="cfg-sec-sub">{sub}</span>}
      </h3>
      <div className="cfg-sec-body">{children}</div>
    </section>
  );
};

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="cfg-row">{children}</div>
);

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const SystemPage: React.FC<{ runner: any; onToggleFs: () => void }> = ({ runner, onToggleFs }) => {
  const { t } = useI18n();
  const sf = runner.sf || {};
  const set = (patch: Record<string, any>) => runner.setSf((prev: any) => ({ ...prev, ...patch }));
  // Engine parity: the five ask%cref rows read as checked when unset.
  const ask = (k: string) => sf[k] ?? true;

  return (
    <>
      <Section title={t('cfg.sec.system')} sub="">
        <Row>
          <Label jp={t('cfg.screenMode')} en={t('cfg.screenModeSub')} />
          <Segmented
            value={sf.screenMode ?? 'window'}
            a={{ value: 'window', label: t('cfg.window') }}
            b={{ value: 'full', label: t('cfg.fullscreen') }}
            onChange={onToggleFs}
          />
        </Row>
        <Row>
          <Label jp={t('cfg.cursor')} en={t('cfg.cursorSub')} />
          <Segmented
            value={sf.designCursor ?? true}
            a={{ value: true, label: t('cfg.design') }}
            b={{ value: false, label: t('cfg.systemCursor') }}
            onChange={v => set({ designCursor: v })}
          />
        </Row>
        <Row>
          <Label jp={t('cfg.effectSpeed')} en={t('cfg.effectSpeedSub')} />
          <span className="cfg-ctl">
            <span className="cfg-slider-col">
              <Slider value={sf.drawPos ?? 120} onChange={v => set({ drawPos: v })} />
              <span className="cfg-ends"><span>{t('cfg.slow')}</span><span>{t('cfg.fast')}</span></span>
            </span>
          </span>
        </Row>
        <Row>
          <Label jp={t('cfg.bgmTitle')} en={t('cfg.bgmTitleSub')} />
          <Segmented
            value={sf.showBGMTitle ?? true}
            a={{ value: true, label: t('cfg.on') }}
            b={{ value: false, label: t('cfg.off') }}
            onChange={v => set({ showBGMTitle: v })}
          />
        </Row>
        <Row>
          <Label jp={t('cfg.confirmDialogs')} en={t('cfg.confirmDialogsSub')} />
          <div className="cfg-check-grid">
            {(['confirmSave', 'confirmLoad', 'confirmQSave', 'confirmQLoad'] as const).map(k => (
              <Check key={k} checked={ask(k)} label={t(`cfg.${k}` as TKey)}
                onChange={() => set({ [k]: !ask(k) })} />
            ))}
          </div>
        </Row>
      </Section>

      <Section title={t('cfg.sec.text')} sub="">
        <Row>
          <Label jp={t('cfg.messageSpeed')} en={t('cfg.messageSpeedSub')} />
          <span className="cfg-ctl">
            <span className="cfg-slider-col">
              <Slider value={sf.textPos ?? 32} onChange={v => set({ textPos: v })} />
              <span className="cfg-ends"><span>{t('cfg.slow')}</span><span>{t('cfg.fast')}</span></span>
            </span>
          </span>
        </Row>
        <Row>
          <Label jp={t('cfg.skipMode')} en={t('cfg.skipModeSub')} />
          <Segmented
            value={sf.skipMode ?? 'ALL'}
            a={{ value: 'READ_ONLY', label: t('cfg.skipRead') }}
            b={{ value: 'ALL', label: t('cfg.skipAll') }}
            onChange={v => set({ skipMode: v })}
          />
        </Row>
        <Row>
          <Label jp={t('cfg.autoSpeed')} en={t('cfg.autoSpeedSub')} />
          <span className="cfg-ctl">
            <span className="cfg-slider-col">
              <Slider value={sf.autoPos ?? 110} onChange={v => set({ autoPos: v })} />
              <span className="cfg-ends"><span>{t('cfg.slow')}</span><span>{t('cfg.fast')}</span></span>
            </span>
          </span>
        </Row>
        <Row>
          <Label jp={t('cfg.windowOpacity')} en={t('cfg.windowOpacitySub')} />
          <span className="cfg-ctl">
            <Slider value={sf.windowOpac ?? 255}
              onChange={v => set({ windowOpac: v })} />
            <span className="cfg-pct">{Math.round((sf.windowOpac ?? 255) / 255 * 100)}%</span>
          </span>
        </Row>
        <Row>
          <Label jp={t('cfg.windowStyle')} en={t('cfg.windowStyleSub')} />
          <Check checked={ask('simpleEventWindow')} label={t('cfg.simpleWindow')}
            onChange={() => set({ simpleEventWindow: !ask('simpleEventWindow') })} />
        </Row>
      </Section>
    </>
  );
};

const SoundPage: React.FC<{ runner: any }> = ({ runner }) => {
  const { t, lang } = useI18n();
  const sf = runner.sf || {};
  const set = (patch: Record<string, any>) => runner.setSf((prev: any) => ({ ...prev, ...patch }));
  // Engine parity: the two wide toggles read as on when unset.
  const voiceCut = sf.voiceCut ?? true;
  const bgmDown = sf.bgmDown ?? true;

  const volRows: Array<{ key: string; label: TKey; def: number }> = [
    { key: 'masterVol', label: 'cfg.master', def: 80 },
    { key: 'bgmVol', label: 'cfg.bgm', def: 80 },
    { key: 'seVol', label: 'cfg.se', def: 80 },
    { key: 'voiceVol', label: 'cfg.voice', def: 80 },
  ];

  return (
    <>
      <Section title={t('cfg.sec.volume')} sub={lang === 'ja' ? t('cfg.sec.volumeSub') : ''}>
        {volRows.map(r => (
          <Row key={r.key}>
            <Label jp={t(r.label)} en="" />
            <span className="cfg-ctl">
              <Slider value={sf[r.key] ?? r.def} max={100}
                onChange={v => set({ [r.key]: v })} />
              <span className="cfg-pct">{sf[r.key] ?? r.def}</span>
            </span>
          </Row>
        ))}
      </Section>

      <Section title={t('cfg.sec.voiceOption')} sub={lang === 'ja' ? t('cfg.sec.voiceOptionSub') : ''}>
        <div className="cfg-wide-checks">
          <Check checked={voiceCut} label={t('cfg.voiceKeep')}
            onChange={() => set({ voiceCut: !voiceCut })} />
          <Check checked={bgmDown} label={t('cfg.bgmDuck')}
            onChange={() => set({ bgmDown: !bgmDown })} />
        </div>
      </Section>

      <Section title={t('cfg.perVoice')} sub="">
        <div className="cfg-voice-grid">
          {CFG_VOICE_CHARS.map((ch, i) => {
            const nameKey =
              ch === 'wom' ? 'cfg.otherFemale' :
              ch === 'man' ? 'cfg.otherMale' :
              `cfg.ch.${ch}` as TKey;
            const muted = !!sf.voiceMute?.[ch];
            const gain = sf.voiceGain?.[ch] ?? 100;
            return (
              <div key={ch} className={`cfg-voice${muted ? ' is-muted' : ''}`}>
                <button className="cfg-voice-face" title={t('cfg.mute')}
                  onClick={e => {
                    e.currentTarget.blur();
                    set({ voiceMute: { ...(sf.voiceMute || {}), [ch]: !muted } });
                  }}>
                  <img src={cfgSoundUrl(`人物像%layer;${i + 1}`)} alt="" draggable={false} />
                  {muted && (
                    <img className="cfg-voice-mute" src={cfgSoundUrl('voice%toggle;off')}
                      alt="" draggable={false} />
                  )}
                </button>
                <div className="cfg-voice-body">
                  <span className="cfg-voice-name">{t(nameKey)}</span>
                  <Slider value={gain} max={100} disabled={muted}
                    onChange={v => set({
                      voiceGain: { ...(runner.sf.voiceGain || {}), [ch]: v },
                    })} />
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
};

const SHORTCUTS: Array<{ key: string; label: TKey }> = [
  { key: 'F1', label: 'cfg.sc.f1' },
  { key: 'F2', label: 'cfg.sc.f2' },
  { key: 'F3', label: 'cfg.sc.f3' },
  { key: 'F4', label: 'cfg.sc.f4' },
  { key: 'F5', label: 'cfg.sc.f5' },
  { key: 'F6', label: 'cfg.sc.f6' },
  { key: 'F7', label: 'cfg.sc.f7' },
  { key: 'F8', label: 'cfg.sc.f8' },
  { key: 'F9', label: 'cfg.sc.f9' },
  { key: 'F11', label: 'cfg.sc.f11' },
  { key: 'F12', label: 'cfg.sc.f12' },
  { key: 'Ctrl', label: 'cfg.sc.ctrl' },
  { key: 'Space', label: 'cfg.sc.space' },
  { key: 'Shift+S', label: 'cfg.sc.ss' },
  { key: 'Shift+L', label: 'cfg.sc.sl' },
];

const ShortcutPage: React.FC = () => {
  const { t } = useI18n();
  return (
    <Section dark title={t('cfg.sec.shortcuts')} sub="">
      <div className="cfg-keys">
        {SHORTCUTS.map(s => (
          <div key={s.key} className="cfg-keyrow">
            <span className="cfg-keybadge">{s.key}</span>
            <span className="cfg-keylabel">{t(s.label)}</span>
          </div>
        ))}
      </div>
    </Section>
  );
};

// ---------------------------------------------------------------------------

const ConfigOverlay: React.FC<Props> = ({ runner }) => {
  const { t } = useI18n();
  const sf = runner.sf || {};
  const page = Math.max(0, Math.min(2, (sf.systemPage ?? 0) | 0));
  const set = (patch: Record<string, any>) => runner.setSf((prev: any) => ({ ...prev, ...patch }));
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Keep sf.screenMode in sync with real fullscreen state.
  useEffect(() => {
    set({ systemPage: page, screenMode: isFs ? 'full' : 'window' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFs]);

  const close = useCallback(() => runner.setConfigOpen(false), [runner]);

  useEffect(() => {
    // A nested Yes/No ask (e.g. 初期化) owns Esc/right-click until answered.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !runner.askDialog) close();
    };
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      if (!runner.askDialog) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', onCtx);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', onCtx);
    };
  }, [close]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const doReset = async () => {
    const yes = await runner.requestConfirm('初期化');
    if (!yes) return;
    runner.setSf((prev: any) => {
      const next = { ...prev, ...CFG_DEFAULTS, systemPage: page };
      delete next.windowOpac;
      return next;
    });
  };

  const tabs: Array<{ i: number; label: string }> = [
    { i: 0, label: t('cfg.tab.system') },
    { i: 1, label: t('cfg.tab.sound') },
    { i: 2, label: t('cfg.tab.shortcut') },
  ];

  return (
    <div className="cfg-overlay" onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}>
      <aside className="cfg-side">
        <div className="cfg-brand">
          <span className="cfg-brand-jp">{t('cfg.title')}</span>
          <span className="cfg-brand-en">Config</span>
        </div>
        <nav className="cfg-tabs">
          {tabs.map(tab => (
            <button key={tab.i}
              className={`cfg-tab${page === tab.i ? ' is-on' : ''}`}
              onClick={e => { e.currentTarget.blur(); set({ systemPage: tab.i }); }}>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="cfg-side-bottom">
          <button className="cfg-side-btn"
            onClick={e => { e.currentTarget.blur(); doReset(); }}>
            {t('cfg.reset')}
          </button>
          <button className="cfg-side-btn is-back"
            onClick={e => { e.currentTarget.blur(); close(); }}>
            {t('cfg.back')}
          </button>
        </div>
      </aside>

      <main className={`cfg-main${page === 2 ? ' is-dark' : ''}`}>
        <div className="cfg-scroll">
          {page === 0 && <SystemPage runner={runner} onToggleFs={toggleFullscreen} />}
          {page === 1 && <SoundPage runner={runner} />}
          {page === 2 && <ShortcutPage />}
        </div>
      </main>
    </div>
  );
};

export default ConfigOverlay;
