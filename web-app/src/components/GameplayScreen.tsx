import React, { useMemo } from 'react';
import { mediaUrl, renderCharacter, timeDef } from '../game/metadata';
import type { StageState, CharState, DynLayer } from '../hooks/useKagRunner';

const STAGE_W = 800;
const STAGE_H = 600;

function bgFilter(stage: StageState): string {
  const f: string[] = [];
  if (stage.bg) {
    const td = timeDef(stage.bg.time);
    if (td?.brightness) f.push(`brightness(${1 + td.brightness / 100})`);
    if (td?.contrast) f.push(`contrast(${1 + td.contrast / 100})`);
  }
  const eff = stage.bgEffect || {};
  if (eff.blur) f.push(`blur(${eff.blur}px)`);
  if (eff.brightness != null) {
    const v = Math.max(0, Math.min(2, 1 + eff.brightness / 255));
    f.push(`brightness(${v})`);
  }
  if (stage.envAdjust?.grayscale) f.push('grayscale(1)');
  return f.join(' ');
}

function bgTransform(stage: StageState): string {
  const eff = stage.bgEffect || {};
  const z = eff.zoom ? eff.zoom / 100 : 1;
  const x = eff.xpos || 0;
  const y = eff.ypos || 0;
  return `translate(${x}px, ${y}px) scale(${z})`;
}

const CharacterView: React.FC<{ ch: CharState }> = ({ ch }) => {
  const rendered = useMemo(
    () => renderCharacter(ch.name, {
      pose: ch.pose,
      dress: ch.dress,
      diff: ch.diff,
      face: ch.face,
      level: ch.level,
    }),
    [ch.name, ch.pose, ch.dress, ch.diff, ch.face, ch.level],
  );
  if (!rendered) return null;

  // The canvas always maps to STAGE_H; level sheets differ only in pixel
  // resolution. charlevel offsets are up/right-positive, so the canvas is
  // center-anchored at stage center and shifted by (-offsetY, +offsetX).
  const d = STAGE_H / rendered.canvas[1];
  const w = rendered.canvas[0] * d;
  const h = rendered.canvas[1] * d;
  const left = STAGE_W / 2 + ch.xpos - w / 2 + rendered.offsetX * d;
  const top = STAGE_H / 2 - h / 2 - rendered.offsetY * d;

  return (
    <div
      className="char-sprite"
      style={{
        position: 'absolute',
        top,
        left,
        width: w,
        height: h,
        opacity: ch.opacity != null ? ch.opacity / 255 : 1,
        zIndex: ch.front ? 40 : 20,
      }}
    >
      {rendered.body && (
        <img
          src={rendered.body.url}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: rendered.body.x * d,
            top: rendered.body.y * d,
            width: rendered.body.w * d,
            height: rendered.body.h * d,
            opacity: rendered.body.opacity,
          }}
        />
      )}
      {rendered.face && (
        <img
          src={rendered.face.url}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: rendered.face.x * d,
            top: rendered.face.y * d,
            width: rendered.face.w * d,
            height: rendered.face.h * d,
            opacity: rendered.face.opacity,
          }}
        />
      )}
    </div>
  );
};

const LayerView: React.FC<{ layer: DynLayer }> = ({ layer }) => {
  if (!layer.file) return null;
  const url = mediaUrl(layer.file);
  if (!url) return null;
  const centered = layer.xpos == null && layer.ypos == null;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className="dyn-layer"
      style={{
        position: 'absolute',
        opacity: layer.opacity / 255,
        display: layer.visible ? 'block' : 'none',
        zIndex: layer.front ? 30 + layer.level : 10 + layer.level,
        ...(centered
          ? { left: 0, top: 0, width: STAGE_W, height: STAGE_H, objectFit: 'contain' }
          : {
              left: `calc(50% + ${layer.xpos ?? 0}px)`,
              top: `calc(50% + ${layer.ypos ?? 0}px)`,
              transform: 'translate(-50%, -50%)',
              maxWidth: STAGE_W,
              maxHeight: STAGE_H,
            }),
      }}
    />
  );
};

interface Props {
  runner: any;
}

const SceneView: React.FC<{ stage: StageState }> = ({ stage }) => {
  const chars = Object.values(stage.chars as Record<string, CharState>).filter(c => c.visible);
  const layers = Object.values(stage.layers as Record<string, DynLayer>).filter(l => l.visible);
  const bgStem = stage.bgHidden ? null : stage.bg?.stem;
  const bgUrl = bgStem ? mediaUrl(bgStem) : '';
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* background */}
      {bgUrl && (
        <img
          src={bgUrl}
          alt=""
          draggable={false}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', filter: bgFilter(stage),
            transform: bgTransform(stage), zIndex: 0,
          }}
        />
      )}

      {/* back layers */}
      {layers.filter(l => !l.front).map(l => <LayerView key={l.name} layer={l} />)}

      {/* characters */}
      {chars.filter(c => !c.front).map(c => <CharacterView key={c.name} ch={c} />)}

      {/* front layers */}
      {layers.filter(l => l.front).map(l => <LayerView key={l.name} layer={l} />)}
      {chars.filter(c => c.front).map(c => <CharacterView key={c.name} ch={c} />)}
    </div>
  );
};

const GameplayScreen: React.FC<Props> = ({ runner }) => {
  const {
    stage, stageTransition, speaker, typewriterText, dialogueText, isWaiting, textVisible,
    advance, choiceOptions, chooseOption, chapterCard, video, onVideoEnded,
    setShowSettings, setShowHistory, isAutoMode, toggleAuto,
    isFastForward, toggleFastForward, quickLoad, saveToSlot,
  } = runner;

  const shownText = typewriterText || (isWaiting ? dialogueText : dialogueText);

  return (
    <div
      className="game-stage-root"
      data-scenario={(runner as any).currentScenario}
      data-pointer={(runner as any).pointer}
    >
    <div
      className={`game-stage ${stage.quake ? 'quake' : ''}`}
      style={{
        width: STAGE_W, height: STAGE_H, position: 'relative', overflow: 'hidden', background: '#000',
        ...(stage.quake
          ? ({ '--qx': `${stage.quake.h}px`, '--qy': `${stage.quake.v}px` } as React.CSSProperties)
          : {}),
      }}
      onClick={() => advance()}
    >
      {/* current scene */}
      <SceneView stage={stage} />

      {/* transition overlay: previous scene animating out */}
      {stageTransition && (
        <div
          key={stageTransition.key}
          className={`trans-overlay ${stageTransition.cls}`}
          style={{
            position: 'absolute', inset: 0, zIndex: 45, pointerEvents: 'none',
            animationDuration: `${stageTransition.ms}ms`,
          }}
        >
          <SceneView stage={stageTransition.old} />
        </div>
      )}

      {/* opening movie */}
      {video && (
        <video
          key={video.stem}
          className="movie-layer"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', zIndex: 90 }}
          src={`/video/${video.stem}.mp4`}
          autoPlay
          playsInline
          onEnded={() => onVideoEnded()}
          onError={(e) => {
            // mp4 missing/unsupported: let the caller continue instead of hanging
            console.warn('video playback failed', video.stem, e);
            onVideoEnded();
          }}
        />
      )}

      {/* chapter card */}
      {chapterCard && (
        <div className="chapter-card" key={chapterCard.key}>
          <div className="chapter-card-title">{chapterCard.title}</div>
        </div>
      )}

      {/* choices */}
      {choiceOptions && (
        <div className="choices-overlay" onClick={e => e.stopPropagation()}>
          {choiceOptions.map((opt: any, i: number) => (
            <button key={i} className="choice-btn" onClick={() => chooseOption(opt)}>
              {opt.text}
            </button>
          ))}
        </div>
      )}

      {/* dialogue */}
      {textVisible && (shownText || speaker) && !choiceOptions && (
        <div className={`dialogue-box ${!shownText ? 'empty' : ''}`}>
          {speaker && <div className="speaker-plate">{speaker}</div>}
          <div className="dialogue-text">{shownText}</div>
          {isWaiting && typewriterText === dialogueText && dialogueText && (
            <div className="click-glyph">▼</div>
          )}
        </div>
      )}

      {/* controls */}
      <div className="stage-controls" onClick={e => e.stopPropagation()}>
        <button title="Auto" className={isAutoMode ? 'active' : ''} onClick={toggleAuto}>自動</button>
        <button title="Skip" className={isFastForward ? 'active' : ''} onClick={toggleFastForward}>スキップ</button>
        <button title="Backlog" onClick={() => setShowHistory(true)}>履歴</button>
        <button title="Page flipper" onClick={() => runner.setShowFlipper(true)}>ページ</button>
        <button title="Document archives" onClick={() => runner.setShowArchives(true)}>文書</button>
        <button title="Quick Load" onClick={quickLoad}>Q.Load</button>
        <button title="Quick Save" onClick={() => saveToSlot('q')}>Q.Save</button>
        <button title="Settings" onClick={() => setShowSettings(true)}>設定</button>
      </div>
    </div>
    </div>
  );
};

export default GameplayScreen;
