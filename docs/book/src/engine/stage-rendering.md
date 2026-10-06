# Stage & camera

Everything renders inside an **800×600 `.stage-frame`**, scaled with CSS
transform to fit the viewport. The stage DOM is absolutely positioned layers
inside one overflow-hidden frame; overlays (config/backlog/album) also mount
inside it so they scale identically.

## Background registration

The engine registers backgrounds **1:1, centered** (`afx/afy=center`): the
image is placed naturally sized with its center at stage center, and the
800×600 frame clips whatever overflows. The runtime does *not* object-fit
backgrounds to the frame — a 1600×1200 master at 100% shows only the center
crop until scripted camera values move it.

A flex wrapper centers the native-size bitmap; the camera transform then
pans/scales about the stage center:

- `zoom` percent (100 = native 1:1), `xpos`/`ypos` offset,
- **×0.3 parallax** on camera motion where the engine defines it,
- camera args may appear directly on `[bg]`/stage tags
  (e.g. `[通学路 昼 xpos=-150 ypos=-150]`); a new stage resets the camera
  unless the tag itself carries values.

`stime` changes time of day in place (same geometry); `bgHidden` suppresses
the image without dropping camera state.

## Dynamic background-like layers

Some cinematic sequences do not change the stage: the scroll macros create a
named layer (`newlay name=scrl file=bg… zoom=100`) and tween its `ypos`,
drawn under/over according to `level`. These follow the layer model in
[Event CGs & dynamic layers](./event-layers.md), not the stage camera.

## Quake

`[quake time=1000]` shakes the stage for the given duration; suppressed
during silent seek replay and skipped output.

## Character slots vs. camera

Character sprites use their own standing geometry derived from
`charlevel.csv` (per-level anchors) and envinit positions — they are not
subject to the background camera pan; the camera moves the world, the actors
have explicit `xpos` slots (left/center/right offsets, default `中`).

## Stage-effect flags

`bgEffect`/env adjustments (grayscale/gamma tags) are stage-wide post states;
the important invariant is that loading a new stage resets them unless the
transition block overrides.
