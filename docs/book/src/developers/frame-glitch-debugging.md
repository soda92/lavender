# Rare frame-glitch debugging

A postmortem of the *"black top-left area for one frame on the
`lave42_haruka` 696→700 transition"* bug, followed by the playbook it
produced for hunting bugs that appear on roughly one frame in a thousand.

See also [Debugging & deep links](./debugging.md) for the debug API surface.

## Postmortem: black corner on an event-layer swap

### Symptom

During an H-scene transition, the top-left region of the stage (up to
roughly 200×250 stage px) flashed pure black for **one frame (~16 ms)**.
The settled frame was always pixel-correct, so screenshots after the
fact never showed anything wrong, and normal play almost never revealed
it.

### Root cause

`682`: event layer shows `ev_haruka_h_01b.png` (800×600, unpositioned,
full-stage contain).

`697`: `[ev_haruka_h_01b_l]` with `xpos=200 ypos=250` — the same artwork
as a 1600×1200 `_l` master, positioned by the engine formula
(`screenX = orx + xpos − afx·imageWidth`, view origin 400/300, center
registration):

```
correct: 400 + 200 − 0.5·1600 = −200
         300 + 250 − 0.5·1200 =  −50      → covers the whole 800×600 stage
```

`LayerView` learned natural dimensions from the `<img>` `onLoad` event
(`nat` state). The layer slot keeps a **stable React key**, so on the
file swap the same component reused the old `nat = {800, 600}`. For one
render the positioned math ran against the stale size:

```
buggy:   400 + 200 − 0.5·800 = 200
         300 + 250 − 0.5·600 = 250       → image top-left at (200,250)
```

Worse, the browser had already decoded the incoming file's header and
laid the `<img>` out at its **new intrinsic 1600×1200 size** a tick
before React processed `onLoad`/`setNat`. Result: the new master painted
from (200,250) for one frame, and everything above/left of it was the
black stage background. One frame later `nat` updated, placement snapped
to (−200,−50), and the glitch was gone.

Why it was so rare: it needs (a) a positioned file swap where (b) the
natural size changes and (c) the new bitmap's header arrives in the
exact commit window. Most swaps are same-size or unpositioned; cached
images still hit it for a single frame.

### Fix

`web-app/src/game/dynLayerFrame.ts` + `LayerView`:

- New files are decoded **off-DOM** (`new Image()`); the view adopts a
  file only once decoded, together with its real dimensions.
- Until then the **previous decoded frame stays on screen with its own
  placement snapshot** (`resolveShownFrame`: `wait` / `hold` /
  `target`). Holding the old bitmap during decode is also what the
  native engine effectively does with preloaded assets — the visible
  cut happens when the new artwork is actually available.
- Before the first decode (`wait`) the layer is hidden instead of
  falling back to a full-stage contain of an unsized image.
- Same-file xpos/ypos retargets still use live layer params, so WAAPI
  pan tracks keep retargeting the base placement.
- Pure helper + geometry regression tests
  (`dynLayerFrame.test.ts`, 6 tests) pin both placements: stale-dims
  (200,250) must never be used; correct end state is (−200,−50).

Commit: `a0db0d7`.

### Lessons

1. **Never derive placement of a new bitmap from DOM-decoded dimensions
   carried in state across a `src` swap.** Decode gate + hold the old
   frame, or know dimensions ahead of time.
2. The browser can paint an `<img>` at its new intrinsic size *between*
   your render and your `onLoad` state update. One-frame bugs live in
   exactly that gap.
3. "Settled frame is correct" proves nothing about transient states.

## Playbook: hunting a one-frame visual bug

### 1. Record at 60 fps with the debug breadcrumb visible

The hash breadcrumb (`#/scenario/<file>/<pointer>`, see
[Debugging & deep links](./debugging.md)) is in every frame, so a screen
recording correlates each frame with a compiled instruction index.
Record at 60 fps — a 30 fps capture misses single-frame artifacts half
the time (this bug was invisible at 15 fps).

### 2. Triage with contact sheets, not frame-by-frame scrubbing

```sh
# extract a window at full frame rate
ffmpeg -ss 11.55 -i capture.mp4 -t 0.8 -vf fps=60 h%03d.png

# tile into sheets for fast scanning
montage h*.png -tile 6x4 -geometry 320x180+2+2 -background cyan sheet.png
```

Scan the sheets, then open only the suspicious frames full-size. Here
the bad frame was obvious once isolated: black stage with a thin strip
of the new image at the bottom.

### 3. Pixel-scan to find the exact frame programmatically

For "a region flashes black/white/wrong color", calibrate the stage
bbox from one known-good frame, then scan every frame:

```python
from PIL import Image
import glob
for p in sorted(glob.glob('h*.png')):
    im = Image.open(p).convert('RGB').crop((80, 118, 875, 545))
    px = im.load()
    hits = [(x, y) for y in range(0, im.height, 2)
                   for x in range(0, im.width, 2)
                   if max(px[x, y]) < 22]
    if len(hits) > 50:
        print(p, len(hits),
              (min(x for x, _ in hits), min(y for _, y in hits),
               max(x for x, _ in hits), max(y for _, y in hits)))
```

Sample every 2 px, threshold generously, and print the hit bounding box
— the bbox shape (here: everything except the bottom-right) is often
more diagnostic than the count. Subtract known dark elements (custom
cursors, letterboxing) by baseline-counting a good frame.

### 4. Read geometry off the frame, then map to scenario

The bad frame showed the new image with its top-left at capture
(273, 358) → stage (~200, ~244), matching the script's `xpos=200
ypos=250` almost exactly. That single observation converted "weird
black area" into "placement computed with wrong image dimensions".

Then read the compiled JSON around the pointer and list every nearby
layer command: file swaps, `xpos/ypos`, `zoom=`, transition argv
(`normal`/`shortfade`/`quickfade`), `newlay`, `nosync`. Macros expand,
so use **compiled indices**, not `.ks` line numbers.

### 5. Classify the race

Common one-frame families:

| Family | Signature |
|---|---|
| Stale state vs new intrinsic layout (this bug) | Correct end placement, wrong for exactly one frame after src swap |
| Unsized image gap | Element briefly at 0×0 or fallback contain, then snaps |
| Double commit | Two distinct correct-ish frames flicker A→B→A |
| Animation from/to wrong base | First animation frame jumps, rest of tween smooth |
| Leaving-clone / z-index | Ghost of old artwork visible for a frame |
| Decode/network gap | Only reproduces cold-cache or throttled |

### 6. Reproduce deterministically — widen the window

A 16 ms window must be stretched before you can iterate:

- **Slow motion:** `window.__lavender.setDebugTimeScale(60)` scales
  engine-driven durations (WAAPI pans, tweens). Note it does **not**
  widen network/decode races — skip/seek always apply end states
  instantly regardless of scale.
- **Throttle the network** (CDP `emulate` / devtools Fast 3G) to widen
  decode gaps. Browser HTTP cache still serves instantly, so also
  force cold loads.
- **Inject delays directly** to make a decode race perfectly
  reproducible, even with cached assets:

  ```js
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  const Orig = window.Image;
  window.Image = function (...a) {
    const img = new Orig(...a);
    Object.defineProperty(img, 'src', {
      configurable: true,
      get: () => desc.get.call(img),
      set: (v) => setTimeout(() => desc.set.call(img, v), 900),
    });
    return img;
  };
  ```

  Patch before the swap, advance one pointer, and the transient state
  sits on screen for 900 ms — screenshot it, measure
  `getBoundingClientRect()`, then release and verify the settled frame.
- Cold hash replay (`?#/scenario/<file>/<n>`) lands via silent replay
  and is another reliable way to hit mount/decode paths.

### 7. Fix at the state-model boundary, then lock it with tests

- Make the transient state *impossible to render*, not merely brief:
  decode gate + held previous frame, stable keys with explicit snapshot
  state, or end states derived from the script model rather than DOM
  measurements.
- Extract the decision into a **pure function** and table-test the
  geometry (this project's rule: every engine-fidelity fix ships with
  unit tests). A test that pins both the buggy numbers `(200,250)` and
  the correct `(-200,-50)` documents *why* the gate exists.
- Re-verify with the delay injection still on: held frame must cover
  the stage throughout, and the final computed style must equal the
  engine formula.
