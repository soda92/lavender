import React, {useEffect, useMemo, useState} from 'react';
import { useT } from '../game/i18n';

interface Props {
  instructions: any[];
  pointer: number;
  scenario: string;
  onSeek: (pointer: number) => void;
}

const stripName = (raw: string): {speaker: string; text: string} => {
  const m = String(raw).match(/^【([^】]+)】(.*)$/s);
  if (!m) return {speaker: '', text: raw};
  const name = m[1];
  const i = name.indexOf('/');
  return {speaker: i >= 0 ? name.slice(i + 1) : name, text: m[2]};
};

const NavigatorTab: React.FC<Props> = ({instructions, pointer, scenario, onSeek}) => {
  const t = useT();
  const max = Math.max(0, instructions.length - 1);
  const [target, setTarget] = useState(Math.min(pointer, max));

  // Follow live playback as the pointer advances.
  useEffect(() => { setTarget(p => (p === Math.min(pointer, max) ? p : Math.min(pointer, max))); }, [pointer]); // eslint-disable-line react-hooks/exhaustive-deps

  const textRows = useMemo(() => {
    const rows: Array<{index: number; speaker: string; text: string}> = [];
    instructions.forEach((inst, index) => {
      if (inst?.type === 'text') {
        const {speaker, text} = stripName(inst.text_jp || inst.text || '');
        if (text.trim()) rows.push({index, speaker, text});
      }
    });
    return rows;
  }, [instructions]);

  // The line spoken at (or immediately before) the target pointer.
  const anchorIdx = useMemo(() => {
    let lo = 0, hi = textRows.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (textRows[mid].index <= target) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }, [textRows, target]);

  const preview = textRows.slice(Math.max(0, anchorIdx - 2), anchorIdx + 3);
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  const go = (v: number) => { const p = clamp(v); setTarget(p); onSeek(p); };
  const step = (d: number) => go(target + d);
  const jump = () => go(target);

  return (
    <div className="side-body">
      <div className="navigator-scenario-row">
        <span className="navigator-scenario">{scenario.split('/').pop()}</span>
      </div>
        <div className="navigator-position">
          <input
            type="number"
            min={0}
            max={max}
            value={target}
            onChange={e => setTarget(Math.max(0, Math.min(max, parseInt(e.target.value || '0', 10) || 0)))}
            onKeyDown={e => { if (e.key === 'Enter') jump(); }}
          />
          <span>/ {max}</span>
          <button className="navigator-jump" onClick={jump}>{t('navigator.jump')}</button>
        </div>

        <input
          className="navigator-range"
          type="range"
          min={0}
          max={max}
          value={target}
          onChange={e => setTarget(parseInt(e.target.value, 10))}
        />

        <div className="navigator-steps">
          <button onClick={() => step(-100)}>-100</button>
          <button onClick={() => step(-10)}>-10</button>
          <button onClick={() => step(-1)}>-1</button>
          <button onClick={() => step(1)}>+1</button>
          <button onClick={() => step(10)}>+10</button>
          <button onClick={() => step(100)}>+100</button>
        </div>

        <div className="navigator-preview">
          {preview.map(r => (
            <div
              key={r.index}
              className={`navigator-line ${r.index === textRows[anchorIdx]?.index ? 'cur' : ''}`}
              role="button"
              tabIndex={0}
              title={t('navigator.jump')}
              onClick={() => go(r.index)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') go(r.index); }}
            >
              <span className="navigator-ptr">{r.index}</span>
              {r.speaker && <b>{r.speaker}　</b>}
              <span>{r.text}</span>
            </div>
          ))}
          {preview.length === 0 && <div className="archives-empty">{t('navigator.empty')}</div>}
        </div>

      <div className="navigator-hint">
        {t('navigator.hint')}
      </div>
    </div>
  );
};

export default NavigatorTab;
