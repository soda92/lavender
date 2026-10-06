import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CFG_PAGES, CFG_CHROME, CFG_SYSTEM, CFG_SOUND, CFG_DEFAULTS,
  cfgUrl, type CfgPage,
} from '../game/skin';

interface Props {
  runner: any;
}

/** Absolute-positioned transparent hit area in stage coordinates. */
const Hit: React.FC<{
  x: number; y: number; w: number; h: number;
  onClick: () => void; onHover?: (v: boolean) => void;
  cursor?: string; title?: string;
}> = ({ x, y, w, h, onClick, onHover, cursor = 'var(--cur-over, pointer)', title }) => (
  <button
    className="cfg-hit"
    style={{ position: 'absolute', left: x, top: y, width: w, height: h, cursor }}
    title={title}
    onClick={e => { e.stopPropagation(); e.currentTarget.blur(); onClick(); }}
    onMouseEnter={onHover ? () => onHover(true) : undefined}
    onMouseLeave={onHover ? () => onHover(false) : undefined}
  />
);

/**
 * Engine slider: a baked track drawn on the sheet plus a draggable knob
 * (nsld 31x8 / vsld 20x6). Knob CENTER runs along the track; position is
 * normalized 0..max.
 */
const SkinSlider: React.FC<{
  x: number; y: number; w: number;
  knobUrl: string; knobW: number; knobH: number;
  value: number; max?: number; onChange: (v: number) => void;
}> = ({ x, y, w, knobUrl, knobW, knobH, value, max = 255, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const dragRef = useRef(false);

  const ratio = Math.max(0, Math.min(1, value / max));
  const setFromClient = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = (clientX - r.left) / r.width;
    onChange(Math.round(Math.max(0, Math.min(1, p)) * max));
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
    <>
      {/* invisible full-length interaction track */}
      <div
        ref={trackRef}
        className="cfg-slider-track"
        style={{ position: 'absolute', left: x, top: y - 7, width: w, height: 22, cursor: 'var(--cur-over, pointer)' }}
        onPointerDown={e => {
          dragRef.current = true;
          setFromClient(e.clientX);
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      />
      <img
        src={knobUrl}
        alt=""
        draggable={false}
        className="cfg-knob"
        style={{
          position: 'absolute',
          left: x + ratio * w - knobW / 2,
          top: y + (8 - knobH) / 2,
          width: knobW, height: knobH,
          pointerEvents: 'none',
          opacity: hover ? 1 : 0.92,
        }}
      />
    </>
  );
};

/** Radio group whose labels/pills are baked into switch%cref (227x254). */
const SwitchGroup: React.FC<{
  runner: any;
  page: string;
  groups: Array<{ sfKey?: string; a: any; b: any; action?: (side: 0 | 1) => void }>;
}> = ({ runner, page, groups }) => {
  const sf = runner.sf || {};
  const set = (patch: Record<string, any>) => runner.setSf((prev: any) => ({ ...prev, ...patch }));
  const normal = cfgUrl(page, 'switch%cref;normal');
  const on = cfgUrl(page, 'switch%cref;on');
  const [hoverPill, setHoverPill] = useState<number | null>(null);
  const over = cfgUrl(page, 'switch%cref;over');

  const pills = CFG_SYSTEM.pills;
  // selection state per pill pair (a = left pill true-ish, b = right)
  const selected: boolean[] = pills.map((_, i) => {
    const g = groups[Math.floor(i / 2)];
    if (!g || !g.sfKey) return false;
    const cur = sf[g.sfKey] ?? g.a.value;
    const val = i % 2 === 0 ? g.a.value : g.b.value;
    return cur === val;
  });

  return (
    <>
      <img src={normal} alt="" draggable={false}
        style={{ position: 'absolute', ...cfgRect(CFG_SYSTEM.switchGroup), pointerEvents: 'none' }} />
      {selected.map((sel, i) => sel && (
        <div key={`sel${i}`} className="cfg-pill-sel"
          style={{
            position: 'absolute',
            left: CFG_SYSTEM.switchGroup.x + pills[i].x,
            top: CFG_SYSTEM.switchGroup.y + pills[i].y,
            width: pills[i].w, height: pills[i].h,
            borderRadius: 4, overflow: 'hidden', pointerEvents: 'none',
          }}>
          <img src={on} alt="" draggable={false} style={{
            position: 'absolute',
            left: -pills[i].x, top: -pills[i].y,
            width: CFG_SYSTEM.switchGroup.w, height: CFG_SYSTEM.switchGroup.h,
          }} />
        </div>
      ))}
      {hoverPill != null && (
        <div style={{
          position: 'absolute',
          left: CFG_SYSTEM.switchGroup.x + pills[hoverPill].x,
          top: CFG_SYSTEM.switchGroup.y + pills[hoverPill].y,
          width: pills[hoverPill].w, height: pills[hoverPill].h,
          borderRadius: 4, overflow: 'hidden', pointerEvents: 'none', opacity: 0.55,
        }}>
          <img src={over} alt="" draggable={false} style={{
            position: 'absolute',
            left: -pills[hoverPill].x, top: -pills[hoverPill].y,
            width: CFG_SYSTEM.switchGroup.w, height: CFG_SYSTEM.switchGroup.h,
          }} />
        </div>
      )}
      {pills.map((p, i) => {
        const g = groups[Math.floor(i / 2)];
        const side = (i % 2) as 0 | 1;
        return (
          <Hit key={i}
            x={CFG_SYSTEM.switchGroup.x + p.x} y={CFG_SYSTEM.switchGroup.y + p.y}
            w={p.w} h={p.h + 10}
            onClick={() => g.action
              ? g.action(side)
              : set({ [g.sfKey!]: side === 0 ? g.a.value : g.b.value })}
            onHover={v => setHoverPill(v ? i : null)}
          />
        );
      })}
    </>
  );
};

/** Checkbox glyph crop positions inside ask%cref art (226x218 local).
 *  Pixel-diff of off vs on puts the check strokes at x1..12 / x117..128. */
const ASK_GLYPH = [
  { x: 0, y: 0, w: 16, h: 17 },    // 確認セーブ
  { x: 116, y: 0, w: 16, h: 17 },  // 確認ロード
  { x: 0, y: 21, w: 16, h: 17 },   // 確認qセーブ
  { x: 116, y: 21, w: 16, h: 17 }, // 確認qロード
  { x: 0, y: 204, w: 16, h: 14 },  // ウィンドウスタイル (CG 表示中はシンプル)
];

const AskGroup: React.FC<{ runner: any; page: string }> = ({ runner, page }) => {
  const sf = runner.sf || {};
  const set = (patch: Record<string, any>) => runner.setSf((prev: any) => ({ ...prev, ...patch }));
  const on = cfgUrl(page, 'ask%cref;on');
  const [hover, setHover] = useState<number | null>(null);

  return (
    <>
      <img src={cfgUrl(page, 'ask%cref;off')} alt="" draggable={false}
        style={{ position: 'absolute', ...cfgRect(CFG_SYSTEM.askGroup), pointerEvents: 'none' }} />
      {CFG_SYSTEM.checks.map((c, i) => {
        const checked = sf[c.key] ?? true;
        const g = ASK_GLYPH[i];
        return (
          <React.Fragment key={c.key}>
            {checked && (
              <div style={{
                position: 'absolute',
                left: CFG_SYSTEM.askGroup.x + g.x, top: CFG_SYSTEM.askGroup.y + g.y,
                width: g.w, height: g.h, overflow: 'hidden', pointerEvents: 'none',
              }}>
                <div style={{
                  position: 'absolute', left: -g.x, top: -g.y,
                  width: CFG_SYSTEM.askGroup.w, height: CFG_SYSTEM.askGroup.h,
                  backgroundImage: `url(${on})`, backgroundSize: 'contain',
                }} />
              </div>
            )}
            {hover === i && checked !== undefined && (
              <div style={{
                position: 'absolute',
                left: c.x, top: c.y, width: c.w, height: c.h,
                background: 'rgba(128,104,172,0.10)', borderRadius: 3, pointerEvents: 'none',
              }} />
            )}
            <Hit x={c.x} y={c.y} w={c.w} h={c.h}
              onClick={() => set({ [c.key]: !checked })}
              onHover={v => setHover(v ? i : null)} />
          </React.Fragment>
        );
      })}
    </>
  );
};

/** Wide sound-page toggle with complete baked off/on art. */
const WideToggle: React.FC<{
  runner: any; page: string; spec: typeof CFG_SOUND.wideToggles[number];
}> = ({ runner, page, spec }) => {
  const sf = runner.sf || {};
  const [hover, setHover] = useState(false);
  const on = sf[spec.key] ?? true;
  const tail = hover ? `${spec.asset}%toggle;over;${on ? 'on' : 'off'}`
                     : `${spec.asset}%toggle;${on ? 'on' : 'off'}`;
  return (
    <>
      <img src={cfgUrl(page, tail)} alt="" draggable={false} style={{
        position: 'absolute',
        left: spec.x + spec.img.ox, top: spec.y + spec.img.oy,
        width: spec.img.w, height: spec.img.h, pointerEvents: 'none',
      }} />
      <Hit x={spec.x} y={spec.y} w={spec.w} h={spec.h}
        onClick={() => runner.setSf((prev: any) => ({ ...prev, [spec.key]: !on }))}
        onHover={setHover} />
    </>
  );
};

function cfgRect(r: { x: number; y: number; w: number; h: number }) {
  return { left: r.x, top: r.y, width: r.w, height: r.h };
}

// ---------------------------------------------------------------------------

const SystemPage: React.FC<{ runner: any; onToggleFs: () => void }> = ({ runner, onToggleFs }) => {
  const page = CFG_PAGES[0];
  const sf = runner.sf || {};
  const set = (patch: Record<string, any>) => runner.setSf((prev: any) => ({ ...prev, ...patch }));

  const knob = cfgUrl(page, 'nsld%slider;normal');

  return (
    <>
      <SwitchGroup runner={runner} page={page} groups={[
        { sfKey: 'screenMode', a: { value: 'window' }, b: { value: 'full' },
          action: () => onToggleFs() },
        { sfKey: 'designCursor', a: { value: true }, b: { value: false } },
        { sfKey: 'showBGMTitle', a: { value: true }, b: { value: false } },
        { sfKey: 'skipMode', a: { value: 'READ_ONLY' }, b: { value: 'ALL' } },
      ]} />
      <AskGroup runner={runner} page={page} />
      {CFG_SYSTEM.sliders.map(s => (
        <SkinSlider key={s.key}
          x={s.x} y={s.y} w={s.w} knobUrl={knob}
          knobW={CFG_SYSTEM.knobs.w} knobH={CFG_SYSTEM.knobs.h}
          value={sf[s.key] ?? s.def}
          onChange={v => set({ [s.key]: v })} />
      ))}
    </>
  );
};

const SoundPage: React.FC<{ runner: any }> = ({ runner }) => {
  const page = CFG_PAGES[1];
  const sf = runner.sf || {};
  const set = (patch: Record<string, any>) => runner.setSf((prev: any) => ({ ...prev, ...patch }));
  const knob = cfgUrl(page, 'nsld%slider;normal');
  const smallKnob = cfgUrl(page, 'vsld%slider;normal');

  return (
    <>
      {CFG_SOUND.sliders.map(s => (
        <SkinSlider key={s.key}
          x={s.x} y={s.y} w={s.w} knobUrl={knob}
          knobW={CFG_SOUND.knobs.w} knobH={CFG_SOUND.knobs.h}
          value={sf[s.key] ?? s.def} max={s.max}
          onChange={v => set({ [s.key]: v })} />
      ))}
      {CFG_SOUND.wideToggles.map(spec => (
        <WideToggle key={spec.key} runner={runner} page={page} spec={spec} />
      ))}
      {CFG_SOUND.chars.map((ch, i) => {
        const [fx, fy] = CFG_SOUND.cellOrigins[i];
        const muted = !!sf.voiceMute?.[ch];
        const gain = sf.voiceGain?.[ch] ?? 100;
        return (
          <React.Fragment key={ch}>
            <img src={cfgUrl(page, `人物像%layer;${i + 1}`)} alt="" draggable={false} style={{
              position: 'absolute', left: fx, top: fy,
              width: CFG_SOUND.faceW, height: CFG_SOUND.faceH, pointerEvents: 'none',
            }} />
            <Hit x={fx + 1} y={fy + 1} w={CFG_SOUND.toggleSize} h={CFG_SOUND.toggleSize}
              onClick={() => set({ voiceMute: { ...(sf.voiceMute || {}), [ch]: !muted } })} />
            {muted && (
              <img src={cfgUrl(page, 'voice%toggle;off')} alt="" draggable={false} style={{
                position: 'absolute', left: fx + 1, top: fy + 1,
                width: CFG_SOUND.toggleSize, height: CFG_SOUND.toggleSize, pointerEvents: 'none',
              }} />
            )}
            <div style={{
              position: 'absolute',
              left: fx + CFG_SOUND.smallKnob.dx,
              top: fy + CFG_SOUND.smallKnob.dy - 8,
              width: CFG_SOUND.smallKnob.trackW, height: 22,
              opacity: muted ? 0.4 : 1, pointerEvents: muted ? 'none' : 'auto',
              cursor: 'var(--cur-over, pointer)',
            }}
              onPointerDown={e => {
                const el = e.currentTarget;
                const move = (ev: PointerEvent) => {
                  const r = el.getBoundingClientRect();
                  const p = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
                  set({ voiceGain: { ...(runner.sf.voiceGain || {}), [ch]: Math.round(p * 100) } });
                };
                const up = () => {
                  window.removeEventListener('pointermove', move);
                  window.removeEventListener('pointerup', up);
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
                const r = el.getBoundingClientRect();
                const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                set({ voiceGain: { ...(sf.voiceGain || {}), [ch]: Math.round(p * 100) } });
              }}
            />
            {!muted && (
              <img src={smallKnob} alt="" draggable={false} style={{
                position: 'absolute',
                left: fx + CFG_SOUND.smallKnob.dx
                  + (gain / 100) * CFG_SOUND.smallKnob.trackW - CFG_SOUND.smallKnob.w / 2,
                top: fy + CFG_SOUND.smallKnob.dy,
                width: CFG_SOUND.smallKnob.w, height: CFG_SOUND.smallKnob.h,
                pointerEvents: 'none',
              }} />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------------------

const ConfigOverlay: React.FC<Props> = ({ runner }) => {
  const sf = runner.sf || {};
  const page = (((sf.systemPage ?? 0) | 0) as CfgPage);
  const set = (patch: Record<string, any>) => runner.setSf((prev: any) => ({ ...prev, ...patch }));
  const [hoverTab, setHoverTab] = useState<number | null>(null);
  const [hoverReset, setHoverReset] = useState(false);
  const [hoverBack, setHoverBack] = useState(false);
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

  const storage = CFG_PAGES[page];
  const tabState = (i: number) =>
    i === page ? 'on' : hoverTab === i ? 'over' : 'normal';
  const TAB_OFFSET: Record<string, { x: number; y: number }> = {
    normal: { x: 17, y: 1 }, over: { x: 16, y: 0 }, on: { x: 0, y: 1 },
  };

  return (
    <div className="cfg-overlay" onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}>
      <img className="cfg-base" src={cfgUrl(storage, '背景%base')} alt="" draggable={false} />

      {/* page sheet */}
      <img src={cfgUrl(storage, 'タブシート%layer')} alt="" draggable={false} style={{
        position: 'absolute', ...cfgRect(CFG_CHROME.sheet[page]), pointerEvents: 'none',
      }} />

      {/* page widgets */}
      {page === 0 && <SystemPage runner={runner} onToggleFs={toggleFullscreen} />}
      {page === 1 && <SoundPage runner={runner} />}
      {/* page 2: shortcut list is fully baked into the sheet art */}

      {/* tab cref (labels baked; on/over/normal differ in size) */}
      {CFG_CHROME.tabHits.map((h, i) => {
        const state = tabState(i);
        const off = TAB_OFFSET[state];
        return (
          <React.Fragment key={i}>
            <img src={cfgUrl(storage, `alltabs%cref;${state}`)} alt="" draggable={false} style={{
              position: 'absolute',
              left: CFG_CHROME.tabs.x + off.x, top: CFG_CHROME.tabs.y + off.y,
              pointerEvents: 'none',
            }} />
            <Hit x={h.x} y={h.y} w={h.w} h={h.h}
              onClick={() => set({ systemPage: i })}
              onHover={v => setHoverTab(v ? i : null)} />
          </React.Fragment>
        );
      })}

      {/* reset / back */}
      <img src={cfgUrl(storage, `初期化%button;${hoverReset ? 'over' : 'off'}`)} alt=""
        draggable={false} style={{ position: 'absolute', ...cfgRect(CFG_CHROME.reset), pointerEvents: 'none' }} />
      <Hit {...CFG_CHROME.reset} onClick={doReset} onHover={setHoverReset} />
      <img src={cfgUrl(storage, `戻る%button;${hoverBack ? 'over' : 'off'}`)} alt=""
        draggable={false} style={{ position: 'absolute', ...cfgRect(CFG_CHROME.back), pointerEvents: 'none' }} />
      <Hit {...CFG_CHROME.back} onClick={close} onHover={setHoverBack} />
    </div>
  );
};

export default ConfigOverlay;
