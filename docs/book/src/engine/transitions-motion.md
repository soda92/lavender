# Transitions & motion

Two distinct mechanisms, deliberately not merged.

## 1. Whole-stage transitions (`begintrans`/`endtrans`)

Visual changes inside a `begintrans … endtrans` block mutate a **draft** and
commit atomically at `endtrans`; `transitionCapture.ts` buffers the previous
stage and renders the change as one full-stage crossfade overlay, so no
per-character enter/exit snapshots are needed for those commits
(`commitStage(true)` skips leaving-snapshot creation).

Typical block (`lave34` compiled 601–605):

```
begintrans
bg_c_black
allchar hide
alllayer hide
endtrans
```

Named transition timing comes from envinit (`envTrans`, `charDispTrans`,
`positionTrans`) with tag tokens able to select others: `quickfade` 250 ms,
`superquick` 100 ms, `notrans`/`normal` = cut, スライド ≈ ±100 px / 200 ms.

## 2. Imperative WAAPI tweens

Per-element enter/exit for characters and the per-property pan tracks for
layers (see [Event CGs & dynamic layers](./event-layers.md)) use the Web
Animations API directly rather than React state-driven CSS classes:

- cancellable on replace/unmount/seek,
- fill-forward with model values already at the end state,
- zero-cost when the element re-renders (nonce-guarded effects),
- **all durations zero during fast-forward, seek/silent replay** — the engine
  zeroes move times while skipping (`KAGEnvImage` checks `isSkip()`; the
  background scroll macros sit inside `beginskip/endskip` for exactly this).

### Effect speed and debug scaling

- `sf.drawPos` (config effect-speed setting) scales transition/tween
  durations via the same draw factor the engine uses.
- `debugTiming.debugMs()` applies the debug time scale (slow-motion
  inspection); WAAPI effects multiply by the live scale.

## Movement reference

| Motion | Timing |
|---|---|
| Character show/hide default crossfade | 300 ms (`charDispTrans`) |
| スライド enter/exit | ±100 px, 200 ms |
| `quickfade` | 250 ms |
| `superquick` | 100 ms |
| `notrans` / `normal` | 0 (cut) |
| Scripted layer pan | `time=` ms, `accel` easing |

## Quake / camera

`quake` shakes via a randomized key; stage camera pans are CSS transforms on
the centered background (×0.3 parallax). Both are suppressed in silent
replay so deep links land on a stable frame.
