import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameAudioHook } from '../hooks/useGameAudio';

// Engine main/soundlist.csv (served by the Go server) maps BGM stems to the
// official track titles, e.g. bgm19 -> 愛の営み.
let titlesCache: Promise<Record<string, string>> | null = null;
function loadTitles(): Promise<Record<string, string>> {
  if (!titlesCache) {
    titlesCache = fetch('/api/soundlist')
      .then(r => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return titlesCache;
}

interface PlayerStatus {
  stem: string;
  file: string;
  paused: boolean;
  muted: boolean;
  volume: number;
  current: number;
  duration: number;
}

interface CueEntry {
  ptr: number;
  stem: string | null; // null = stop/fade-out
  snippet: string;
}

interface LogEntry {
  id: number;
  scenario: string;
  ptr: number;
  stem: string | null;
}

interface DebugPanelProps {
  runner: any;
  audio: GameAudioHook;
  onClose: () => void;
}

const BGM_TAG = /^bgm\d/i;

function cueFrom(inst: any): { stem: string | null } | null {
  if (inst?.type !== 'command') return null;
  const name: string = inst.name || '';
  const args = inst.args || {};
  const argv: string[] = inst.argv || [];
  if (BGM_TAG.test(name)) return { stem: name };
  if (name === 'stopbgm' || name === 'fadeoutbgm' || name === 'allstop' || name === 'stopallsound') {
    return { stem: null };
  }
  if (name === 'bgm') {
    if (args.stop != null || args.fadeout != null || argv.includes('stop')) return { stem: null };
    const ref = args.storage || args.file || args.name || args.play
      || argv.find((a: string) => BGM_TAG.test(a));
    if (ref) return { stem: String(ref).replace(/\.\w+$/, '') };
  }
  return null;
}

export default function DebugPanel({ runner, audio, onClose }: DebugPanelProps) {
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const activeCueRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);

  useEffect(() => {
    let alive = true;
    loadTitles().then(t => { if (alive) setTitles(t || {}); });
    return () => { alive = false; };
  }, []);

  // Poll the actual audio element (identity of audio.bgmPlayer is stable).
  useEffect(() => {
    const p = audio.bgmPlayer;
    const read = () => {
      const src = p.src || '';
      setStatus({
        stem: p.dataset.stem || '',
        file: src ? decodeURIComponent(src.split('/').pop() || '') : '',
        paused: p.paused,
        muted: p.muted,
        volume: p.volume,
        current: p.currentTime || 0,
        duration: Number.isFinite(p.duration) ? p.duration : 0,
      });
    };
    read();
    const timer = setInterval(read, 400);
    p.addEventListener('play', read);
    p.addEventListener('pause', read);
    return () => {
      clearInterval(timer);
      p.removeEventListener('play', read);
      p.removeEventListener('pause', read);
    };
  }, [audio.bgmPlayer]);

  // Live cue log. Silent seeks replay every cue in a tight burst; collapse a
  // burst into a single (final) entry, while real-time cues seconds apart all
  // stay.
  const logRef = useRef<LogEntry[]>([]);
  useEffect(() => {
    const now = performance.now();
    const prev: any = logRef.current[logRef.current.length - 1];
    if (prev && prev.scenario === (runner.currentScenario || '') && now - prev._at < 300) {
      prev.ptr = runner.pointer ?? 0;
      prev.stem = runner.bgmStem ?? null;
      prev._at = now;
      setLog([...logRef.current]);
      return;
    }
    const entry: any = {
      id: logIdRef.current++,
      scenario: runner.currentScenario || '',
      ptr: runner.pointer ?? 0,
      stem: runner.bgmStem ?? null,
      _at: now,
    };
    logRef.current = [...logRef.current.slice(-11), entry];
    setLog([...logRef.current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runner.bgmStem]);

  // BGM cue timeline of the loaded scenario, with following dialogue context.
  const cues = useMemo<CueEntry[]>(() => {
    const data: any[] = runner.scenarioInstructions;
    if (!data) return [];
    const out: CueEntry[] = [];
    for (let i = 0; i < data.length; i++) {
      const cue = cueFrom(data[i]);
      if (!cue) continue;
      let snippet = '';
      for (let j = i + 1; j < Math.min(data.length, i + 40); j++) {
        if (cueFrom(data[j])) break;
        const tj = data[j]?.text_jp;
        if (typeof tj === 'string' && tj.trim()) { snippet = tj.trim().slice(0, 18); break; }
      }
      out.push({ ptr: i, stem: cue.stem, snippet });
    }
    return out;
  }, [runner.scenarioInstructions]);

  // Index of the cue active at the current pointer. A seek stops with the
  // target instruction still pending, so a cue has fired only when pointer
  // is strictly past its command index.
  const activeCue = useMemo(() => {
    let idx = -1;
    for (let k = 0; k < cues.length; k++) if (cues[k].ptr < runner.pointer) idx = k; else break;
    return idx;
  }, [cues, runner.pointer]);

  useEffect(() => {
    activeCueRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [activeCue, runner.currentScenario]);

  const logicalStem: string | null = runner.bgmStem ?? null;
  const mismatch = !!status && !!logicalStem && status.stem !== logicalStem;
  const fmt = (s: number) => {
    if (!s) return '0:00';
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  };

  return (
    <div className="debug-panel" onClick={e => e.stopPropagation()}>
      <div className="debug-head">
        <span>🛠 BGM Debug</span>
        <button className="debug-x" onClick={onClose} title="Close (D)">×</button>
      </div>

      <div className="debug-body">
        <section className="debug-card">
          <div className="debug-row"><em>scenario</em>
            <b>{runner.currentScenario || '—'}:{runner.pointer}</b></div>

          <div className="debug-now">
            {logicalStem ? (
              <>
                <div className="debug-track">
                  <span className="debug-stem">{logicalStem}</span>
                  <span className="debug-state">{status?.paused ? '⏸' : '▶'}</span>
                </div>
                {titles[logicalStem] && <div className="debug-title">🎵 {titles[logicalStem]}</div>}
              </>
            ) : (
              <div className="debug-track"><span className="debug-stem debug-none">(no BGM)</span>
                <span className="debug-state">⏹</span></div>
            )}
          </div>

          <div className="debug-row"><em>player</em>
            <b className={mismatch ? 'debug-warn' : ''}>
              {status?.stem || '(stopped)'}
              {mismatch && ' ⚠ mismatch'}
            </b></div>
          <div className="debug-row"><em>file</em><b>{status?.file || '—'}</b></div>
          <div className="debug-row"><em>time</em>
            <b>{fmt(status?.current ?? 0)} / {fmt(status?.duration ?? 0)}</b></div>
          <div className="debug-row"><em>vol</em>
            <b>{Math.round((status?.volume ?? 0) * 100)}%{status?.muted ? ' 🔇' : ''}</b></div>

          <div className="debug-btns">
            <button
              onClick={() => {
                const p = audio.bgmPlayer;
                if (p.paused) p.play().catch(() => {});
                else p.pause();
              }}
            >
              {status?.paused ? '▶ play' : '⏸ pause'}
            </button>
            <button onClick={() => audio.toggleBgm()}>
              {status?.muted ? '🔊 unmute' : '🔇 mute'}
            </button>
          </div>
        </section>

        <section className="debug-card">
          <div className="debug-section-title">recent cues</div>
          {log.length === 0 && <div className="debug-empty">no cues observed yet</div>}
          {log.slice().reverse().map(e => (
            <div key={e.id} className="debug-logrow">
              <span className="debug-logstem">{e.stem || '∎ stop'}</span>
              {e.stem && titles[e.stem] && <span className="debug-logtitle">{titles[e.stem]}</span>}
              <span className="debug-logptr">{e.scenario.split('/').pop()}:{e.ptr}</span>
            </div>
          ))}
        </section>

        <section className="debug-card debug-timeline-card">
          <div className="debug-section-title">
            bgm timeline <span>{cues.length} cues</span>
          </div>
          <div className="debug-timeline">
            {cues.length === 0 && <div className="debug-empty">no BGM commands in this file</div>}
            {cues.map((c, k) => (
              <div
                key={c.ptr}
                ref={k === activeCue ? activeCueRef : null}
                className={`debug-cue ${k === activeCue ? 'is-active' : ''} ${c.stem ? '' : 'is-stop'}`}
              >
                <button
                  className="debug-cue-jump"
                  title={`Seek past cue ${c.ptr} (track starts on arrival)`}
                  onClick={() => runner.seekToPointer(c.ptr + 1)}
                >
                  →{c.ptr}
                </button>
                <span className="debug-cue-stem">{c.stem || '∎ stop'}</span>
                {c.stem && titles[c.stem] && (
                  <>
                    <span className="debug-cue-title">{titles[c.stem]}</span>
                    <button
                      className="debug-cue-preview"
                      title={`Preview ${c.stem} without seeking`}
                      onClick={() => c.stem && audio.playBgm(c.stem)}
                    >
                      🔊
                    </button>
                  </>
                )}
                {c.snippet && <span className="debug-cue-snip">{c.snippet}</span>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
