# Event CGs & dynamic layers

## Single event layer

The Akabei framework keeps **one** event layer addressed by:

- `[ev file=…]` — load a CG into the event slot;
- `[ev hide]` / bare re-address (`[ev opacity=…]`);
- shorthand `[ev_<stem>]` = same slot;
- intentional overlays use `[newlay name=…]` (named layers such as
  `scrl`, `haruka1`, `riko1`, `mentuki_ni`).

In `StageState`, event art always lands in slot `__event__`. Loading a
**different file** resets `xpos/ypos` unless the tag itself supplies a
position; a same-file re-address keeps alignment.

## `_l` files are hi-res masters for zoom/pan crops, not second CGs

For event art there are often two files, e.g.

```
evimage/ev_riko_h_05aa.png      800×600
evimage/large/ev_riko_h_05aa_l.png  1600×1200
```

The `_l` file is **the same artwork at 2×** (verified by image diff:
≈99% identical after downscale), intended to be drawn at natural size
(1:1) clipped by the 800×600 window. Layer placement has two origins (see
the layer model below): with the defaults, image center lands at
`400+xpos, 300+ypos`, so the riko pan ends `xpos=400 ypos=300` at the
top-left quadrant of the master. Positioning the 1600×1200 master at
different centers is the zoom/pan window; the base 800×600 renders
contain-fit when unpositioned.

**Do not slot `_l` separately.** An earlier implementation created
`__event_l__`, which stacked the master on top of the base and produced
"partial pictures" on alternation (e.g. `lave42_haruka` 02a↔02b_l cuts).
Now both files replace one slot; no-time cuts cancel any running pan and
swap src instantly.

## Layer model (`DynLayer`)

```ts
{ name, file, visible, front, level, xpos: number|null, ypos, opacity,
  anim?: { pos?: …, op?: … } }
```

- z-order: `front ? 30+level : 10+level`; event slot defaults front/level 6;
- unpositioned → `0,0 800×600 object-fit:contain`;
- positioned → natural size at the engine-computed top-left. Placement has
  **two independent origins** (`KAGEnvImage.calcPosition` →
  `EnvGraphicLayer.recalcPosition`, with the event world `nocamera`/
  `noshift` and simple layers `levelz=100`, so the camera terms vanish):

  ```
  screenX = orx + xpos − afxFrac · imageWidth
  screenY = ory + ypos − afyFrac · imageHeight
  ```

  - `afx/afy` (image fraction, `origin=<1..9>` 1=left/top … 9=center/center,
    explicit `afx=`/`afy=` words): which point of the image is anchored —
    0 / half / full size. Default center/center.
  - `orx/ory` (view origin in stage px, `vorigin=<1..9>` mapped to
    0/400/800 × 0/300/600, explicit `orx=`/`ory=` words or numbers): the
    point xpos/ypos are measured **from**. Default mid-stage 400/300.
  - `vorigin`/`orx`/`ory` are also the rotation-view pivot but participate
    in placement exactly as above.
  - Worked cases (all in unit tests + verified live):
    - event `_l` master 1600×1200, no origins, end `xpos=400 ypos=300` →
      (0,0): xpos/ypos are offsets from mid-stage, **not** absolute image
      centers (the earlier mistake),
    - sky-scroll layer 1100×900 at `xpos=0 ypos=150` → (−150,0), fully
      covering the stage; treating xpos as an absolute center put it at
      −550 and left the right 250 px showing the dojo ("half sky"),
    - keiko miniscenes set both `origin=1` and `vorigin=1` → top-left
      stage coordinates (keiko2's 447 px frame at xpos 353 ends on the
      right edge),
    - quiz cabinet `orx=center ory=220 ypos=-600→0`: numeric view origin,
      rests centered at y 27,
  - `layerScreenPlacement()` in `metadata.ts` is the pure implementation,
    with `originModeToViewPx`/`originParamPx`; the component measures
    natural image size (`onLoad`) since the fraction needs px,
- opacity is 0–255 like the engine.

## Scripted pans/fades (`time=`/`accel`)

Large-art pans are **scripted, not mouse-driven**. A pan sequence
(`lave.riko2`, compiled 1631–1634):

```
[ev file=…_l opacity=0 xpos=-200 ypos=-400]      # cut, invisible
[ev opacity=255 time=1500]                        # fade in (no sync)
[ev xpos=400 ypos=300 time=3000 accel=-1 sync transwait=500]
[ev file=…]                                       # back to base art
```

Implementation:

- `applyLayerArgs` builds **per-property WAAPI tracks** (`pos`, `op`) from
  `time=`, each with its own nonce. Separate tracks let the 1.5 s fade and
  3 s ease-out glide issued back-to-back overlap on one element (two
  concurrent WAAPI animations), instead of the second tag replacing the
  first.
- Model values always hold the **end state**; WAAPI uses
  `fill: 'forwards'`, released on finish (inline style already equals the
  end keyframe, so there is no pop). Track nonces dedupe clones produced by
  unrelated commits; a cut cancels all in-flight tracks and clears seen
  nonces.
- **`sync`** blocks the slice for the full duration; **`transwait=`** caps
  the wait while motion continues; **`nowait`/`nosync`** return immediately.
- `accel<0` → ease-out, `>0` → ease-in, 0 → linear. Durations honor the
  config effect-speed factor (`drawPos`) and the debug time scale.
- Skip / seek / silent replay attach **no** animations and apply end states
  immediately (engine zeroes times while skipping); transient anims are
  stripped from save snapshots.

## Named layers

`newlay` creates an arbitrary key (`scrl` from the scroll macros, the
`haruka1/riko1/mentuki_ni` overlays). The generic
`world.layers[name]` branch re-addresses them with the same args/tracks.
`alllayer hide`/`hideevent` control visibility; a file swap or a no-time
position retarget cuts like the event slot.

## Gallery interaction

Every `[ev]`/`[ev_*]` file display marks the tile seen (`markCgSeen`);
`/api/cglist` canonicalizes tiles and `_l` is never counted as a separate
gallery entry (identical `_l` frames are dropped).
