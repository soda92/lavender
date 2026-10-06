import React, { useEffect, useMemo, useRef } from 'react';
import { envYOffset, mediaUrl, renderCharacter, timeDef } from '../game/metadata';
import { paintSpriteComposite, paintSpriteFace } from '../game/spriteComposite';
import { SKIN, SKIN2, SYS_BUTTONS } from '../game/skin';
import { useT } from '../game/i18n';
import { useDebugTimeScale } from '../game/debugTiming';
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
  // Engine world.tjs recalcPosition for the environment layer:
  //   left = originx + (((xpos - camerax) * z + xoff) * camerazoom) - shiftx
  // where z = envinit.bglevelz / 100 = 0.3 (background camera parallax).
  // The bitmap is center-registered and the layer zoom scales about the
  // stage center, so here the 800x600 element uses object-fit:none
  // (native-size centered art) and transform-origin:center.
  const P = 0.3;
  const cz = eff.camerazoom ? eff.camerazoom / 100 : 1;
  const s = (eff.zoom ? eff.zoom / 100 : 1) * cz;
  const x = ((eff.xpos || 0) - (eff.camerax || 0)) * P * cz - (eff.shiftx || 0);
  const y = ((eff.ypos || 0) - (eff.cameray || 0)) * P * cz - (eff.shifty || 0);
  return `translate(${x}px, ${y}px) scale(${s})`;
}

// Engine charDispTrans / charTrans: per-layer 300ms crossfade for
// show / hide / pose changes (zero time while skipping or seeking).
const CHAR_FADE_MS = 300;

const CharacterView: React.FC<{ ch: CharState; instant?: boolean }> = ({ ch, instant }) => {
  // Debug slow-motion factor for transition inspection (1 = engine speed).
  const timeScale = useDebugTimeScale();
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
  const baseOp = ch.opacity != null ? ch.opacity / 255 : 1;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);
  const enterNonceRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(false);

  // Engine show/hide transitions are imperative tweens (MoveAction +
  // crossfade): WAAPI guarantees the off-screen start frame is painted
  // before the transition runs, unlike rAXF state flips.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    animRef.current?.cancel();
    animRef.current = null;
    if (instant) return;
    const play = (dxFrom: number, opFrom: number, dxTo: number, opTo: number, ms: number) => {
      if (ms <= 0) return;
      const a = el.animate(
        [
          { transform: `translateX(${dxFrom}px)`, opacity: opFrom },
          { transform: `translateX(${dxTo}px)`, opacity: opTo },
        ],
        { duration: ms * timeScale, easing: 'linear', fill: 'forwards' },
      );
      animRef.current = a;
      // Steady inline style equals the end keyframe: release after finish
      // without a visual pop.
      a.onfinish = () => a.cancel();
    };
    if (ch.leaving) {
      const a = ch.exitAnim;
      play(0, baseOp, a?.dx ?? 0, 0, a?.ms ?? CHAR_FADE_MS);
      return;
    }
    const enter = ch.enterAnim;
    if (enter && enterNonceRef.current !== enter.nonce) {
      enterNonceRef.current = enter.nonce;
      play(enter.dx, 0, 0, baseOp, enter.ms);
      return;
    }
    if (!mountedRef.current) {
      // No named enter: engine charDispTrans 300ms crossfade.
      mountedRef.current = true;
      play(0, 0, 0, baseOp, CHAR_FADE_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch.leaving, ch.enterAnim, ch.exitAnim, ch.visible, instant, baseOp, timeScale]);

  // Pose/dress/diff/face changes cut instantly. The engine script
  // (charTrans=crossfade 300ms) crossfades stand layers, but in banter
  // scenes tags arrive every line and perpetual ghosts feel noisy; the
  // painter keeps the previous bitmap until the new composite is ready,
  // so the swap is flash-free. Enter/exit (below) keep their authored
  // fades/slides.
  useEffect(() => {
    if (!rendered?.body || !canvasRef.current) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    canvas.style.opacity = '1';
    void paintSpriteComposite(rendered, canvas, () => !cancelled);
    return () => { cancelled = true; };
  }, [rendered]);

  if (!rendered) return null;

  // Native 1:1 pixels. The trimmed page is bottom-center anchored at
  // (400, 300 + env.yoffset); charlevel offsets are baked into
  // rendered.offsetX/Y (x right-positive, y up-positive).
  const { page } = rendered;
  const left = STAGE_W / 2 + ch.xpos + rendered.offsetX - page.w / 2;
  const top = STAGE_H / 2 + envYOffset() + rendered.offsetY - page.h;
  // Face-only （顔 DISPPOSITION) sprites have no body to composite.
  const composite = !!rendered.body;
  // Static resting style; the enter/exit WAAPI tween overrides it while alive.
  const rootOp = ch.visible ? baseOp : 0;

  return (
    <div
      ref={rootRef}
      className="char-sprite"
      data-char={ch.name}
      style={{
        position: 'absolute',
        top,
        left,
        width: page.w,
        height: page.h,
        opacity: rootOp,
        transform: 'translateX(0px)',
        zIndex: ch.front ? 40 : 20,
        pointerEvents: 'none',
        willChange: 'transform, opacity',
      }}
    >
      {/* Body-less face-only sprites （顔 DISPPOSITION) render directly.
          Normal sprites are single-bitmap composites painted on canvas;
          pose/face swaps cut instantly (see paint effect above). */}
      {!composite && rendered.body && (
        <img
          src={rendered.body.url}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: rendered.body.x,
            top: rendered.body.y,
            width: rendered.body.w,
            height: rendered.body.h,
            opacity: rendered.body.opacity,
          }}
        />
      )}
      {!composite && rendered.face && (
        <img
          src={rendered.face.url}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: rendered.face.x,
            top: rendered.face.y,
            width: rendered.face.w,
            height: rendered.face.h,
            opacity: rendered.face.opacity,
          }}
        />
      )}
      {/* Single-bitmap composite: opaque once painted, no face-plate seam
          under stage scaling; pose/face changes repaint in place. */}
      {composite && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute', inset: 0, width: page.w, height: page.h,
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
  const positioned = layer.xpos != null || layer.ypos != null;
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
        ...(!positioned
          ? { left: 0, top: 0, width: STAGE_W, height: STAGE_H, objectFit: 'contain' }
          : {
              // Engine alignment is center/center: xpos/ypos name the image
              // center in stage coordinates (top-left origin, so 400/300 is
              // mid-stage). Large ("_l") art is 1600x1200 and drawn at its
              // natural size; the 800x600 stage simply crops it for pans.
              left: layer.xpos ?? 0,
              top: layer.ypos ?? 0,
              transform: 'translate(-50%, -50%)',
            }),
      }}
    />
  );
};

interface Props {
  runner: any;
}

/**
 * Message-window bust ("miniface"): the engine crops the level-0 顔領域
 * (205x200 at PSD 0,0) of the SPEAKING character's composed standing
 * sprite — current costume and expression — and clips it through the
 * soft-edge 顔mask. Only shown for a visible on-stage speaker.
 */
const MiniFace: React.FC<{ ch: CharState; mask: string }> = ({ ch, mask }) => {
  const rendered = useMemo(
    () => renderCharacter(ch.name, {
      pose: ch.pose, dress: ch.dress, diff: ch.diff, face: ch.face, level: 0,
    }),
    [ch.name, ch.pose, ch.dress, ch.diff, ch.face],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!rendered?.body || !canvasRef.current) return;
    let cancelled = false;
    void paintSpriteFace(rendered, canvasRef.current, () => !cancelled);
    return () => { cancelled = true; };
  }, [rendered]);

  if (!rendered?.body) return null;
  const r = rendered.faceRect;
  return (
    <canvas
      ref={canvasRef}
      className="mes-face"
      style={{
        left: 0, top: 1, width: r.width, height: r.height,
        WebkitMaskImage: `url(${mask})`,
        maskImage: `url(${mask})`,
      } as React.CSSProperties}
    />
  );
};

const SceneView: React.FC<{ stage: StageState; instant?: boolean }> = ({ stage, instant }) => {
  // leaving chars are kept mounted for their fade-out.
  const chars = Object.values(stage.chars as Record<string, CharState>)
    .filter(c => c.visible || c.leaving);
  const layers = Object.values(stage.layers as Record<string, DynLayer>).filter(l => l.visible);
  const bgStem = stage.bgHidden ? null : stage.bg?.stem;
  const bgUrl = bgStem ? mediaUrl(bgStem) : '';
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* background */}
      {bgUrl && (
        // Flex wrapper center-registers the native-size bitmap (afx/afy=center);
        // the camera transform then pans/scales it about the stage center.
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      pointerEvents: 'none' }}>
          <img
            src={bgUrl}
            alt=""
            draggable={false}
            style={{
              width: 'auto', height: 'auto', flex: 'none',
              filter: bgFilter(stage),
              transform: bgTransform(stage), transformOrigin: 'center',
            }}
          />
        </div>
      )}

      {/* back layers */}
      {layers.filter(l => !l.front).map(l => <LayerView key={l.name} layer={l} />)}

      {/* characters */}
      {chars.filter(c => !c.front).map(c => (
        <CharacterView key={c.name} ch={c} instant={instant} />
      ))}

      {/* front layers */}
      {layers.filter(l => l.front).map(l => <LayerView key={l.name} layer={l} />)}
      {chars.filter(c => c.front).map(c => (
        <CharacterView key={c.name} ch={c} instant={instant} />
      ))}
    </div>
  );
};

const GameplayScreen: React.FC<Props> = ({ runner }) => {
  const {
    stage, stageTransition, speaker, typewriterText, dialogueText, isWaiting, textVisible,
    advance, choiceOptions, chooseOption, video, onVideoEnded,
    isAutoMode, toggleAuto,
    isFastForward, isSeeking, toggleFastForward, quickLoad, saveToSlot,
    windowHidden, setWindowHidden, sf,
    sideTab, setSideTab, setGameState, replayVoice, currentVoice,
    configOpen, setConfigOpen, requestConfirm,
  } = runner;
  const t = useT();
  const immerse = !!sf?.immerseMode;
  // Message-window face: only when the speaker is a visible stand character.
  const faceChar = !speaker ? null : (
    Object.values(stage.chars as Record<string, CharState>)
      .find(c => c.visible && c.name === speaker) || null
  );
  // ウィンドウスタイル: "CG 表示中はシンプルなウィンドウを使用" — while an
  // event CG layer is up, swap message01 for the message02 skin.
  const eventCg = Object.keys(stage.layers as Record<string, DynLayer>).some(
    k => k.includes('__event') && (stage.layers as Record<string, DynLayer>)[k]?.visible,
  );
  const simple = !!sf?.simpleEventWindow && eventCg;
  // Engine: whole frame opacity = sf.windowOpac/255 (default unset). The
  // shipped base panel is only ~89% white; the default multiplier gives
  // the semi-transparent reference look while the name plate keeps its
  // own (near-solid) alpha.
  const mesOpac = sf?.windowOpac != null ? sf.windowOpac / 255 : 0.9;

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
      <SceneView
        stage={stage}
        instant={isFastForward || isSeeking || !!stageTransition}
      />

      {/* recollection replay: quit back to the scene gallery */}
      {runner.sceneReplay && (
        <button
          className="scene-exit"
          onClick={e => { e.stopPropagation(); runner.finishSceneReplay(); }}
        >
          ✕ {t('gallery.endScene')}
        </button>
      )}

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
          <SceneView stage={stageTransition.old} instant />
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

      {/* choices: select.csv button skin (32,184 736x45) */}
      {choiceOptions && (
        <div
          className="choices-overlay"
          style={{
            '--choice-off': `url(${SKIN.choiceOff})`,
            '--choice-over': `url(${SKIN.choiceOver})`,
          } as React.CSSProperties}
          onClick={e => e.stopPropagation()}
        >
          {choiceOptions.map((opt: any, i: number) => (
            <button key={i} className="choice-btn" onClick={() => chooseOption(opt)}>
              {opt.text}
            </button>
          ))}
        </div>
      )}

      {/* dialogue: engine message01 skin (coordinates from message01.csv) */}
      {textVisible && !windowHidden && (shownText || speaker) && !choiceOptions && (
        immerse ? (
          <div className="dialogue-immerse">
            <div className="immerse-pill">
              {speaker && <span className="immerse-speaker">［{speaker}］</span>}
              <span className="immerse-text">{shownText}</span>
              {isWaiting && typewriterText === dialogueText && dialogueText && (
                <span className="click-glyph">▼</span>
              )}
            </div>
          </div>
        ) : (
          <div className="mes-window">
            <div className="mes-chrome">
              <img className="mes-base" src={simple ? SKIN2.mesBase : SKIN.mesBase} alt="" draggable={false} style={{ opacity: mesOpac }} />
              {!simple && <img className="mes-frame" src={SKIN.mesFrame} alt="" draggable={false} />}
            </div>
            {faceChar && <MiniFace ch={faceChar} mask={simple ? SKIN2.mesFaceMask : SKIN.mesFaceMask} />}
            {speaker && (
              <>
                <img
                  className={simple ? 'mes-name-line' : 'mes-name-plate'}
                  src={simple ? SKIN2.mesName : SKIN.mesName}
                  alt=""
                  draggable={false}
                />
                <div className="mes-name-text">{speaker}</div>
              </>
            )}
            <div className="mes-text">{shownText}</div>
            {isWaiting && typewriterText === dialogueText && dialogueText && (
              <div className="mes-glyph"><img src={SKIN.clickGlyph} alt="" draggable={false} /></div>
            )}
          </div>
        )
      )}

      {/* system button strip: message00 skin (0,580 800x20) */}
      {!windowHidden && (
        <div className="sys-bar" onClick={e => e.stopPropagation()}>
          <img className="sys-bar-bg" src={SKIN.sysBar} alt="" draggable={false} />
          {SYS_BUTTONS.map(b => {
            const active =
              (b.id === 'auto' && isAutoMode) ||
              (b.id === 'skip' && isFastForward) ||
              (b.id === 'config' && configOpen) ||
              ((b.id === 'save' || b.id === 'load' || b.id === 'log')
                && sideTab === (b.id === 'save' || b.id === 'load' ? 'archives' : 'history'));
            const onSys = async () => {
              switch (b.id) {
                case 'qsave':
                  if (sf?.confirmQSave === false || await requestConfirm('クイックセーブ')) saveToSlot('q');
                  break;
                case 'qload':
                  if (sf?.confirmQLoad === false || await requestConfirm('クイックロード')) quickLoad();
                  break;
                case 'save': case 'load':
                  setSideTab(sideTab === 'archives' ? null : 'archives');
                  break;
                case 'config': setConfigOpen(true); break;
                case 'log':
                  setSideTab(sideTab === 'history' ? null : 'history');
                  break;
                case 'title': case 'exit':
                  if (await requestConfirm('タイトル')) setGameState('TITLE');
                  break;
                case 'auto': toggleAuto(); break;
                case 'skip': toggleFastForward(); break;
                case 'voice': replayVoice(currentVoice); break;
                case 'hide': setWindowHidden(true); break;
              }
            };
            return (
              <button
                key={b.id}
                className={`sys-btn kind-${b.kind} ${active ? 'on' : ''}`}
                style={{ left: b.x, width: b.w }}
                title={b.kind === 'text' ? b.label : b.id}
                onClick={e => { e.currentTarget.blur(); onSys(); }}
              >
                {b.kind === 'text' ? b.label
                  : b.kind === 'voice' ? (
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
                      <path d="M3 9v6h4l5 5V4L7 9H3z" />
                      <path d="M16 8a5 5 0 010 8" stroke="currentColor" strokeWidth="2" fill="none" />
                      <path d="M18.5 5.5a9 9 0 010 13" stroke="currentColor" strokeWidth="2" fill="none" />
                    </svg>
                  ) : b.glyph}
              </button>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
};

export default GameplayScreen;
