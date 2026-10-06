# Engine source references

Player rules were derived from the Akabei/KiriKiri framework files shipped
with the game (Shift-JIS; read with `iconv -f SHIFT_JIS -t UTF-8`). This
index maps player subsystems to the exact source of each rule.

| Player area | Game system file(s) | Key definitions |
|---|---|---|
| Character dispositions | `system/KAGEnvImage.tjs` | `BOTH/BU/FACE/SHOW/CLEAR/INVISIBLE`, `disp` setter, `isShowBU/isShowFace/isClear` (≈170–230); `hide` → CLEAR (≈1619) |
| Char tag effects on disp | `system/KAGEnvCharacter.tjs` | `setImage/setPose/setDress/setFace` set `disp = SHOW`; `setPosition` (xpos/level auto-show while CLEAR, explicit disp token); `allchar` is in KAGEnvironment.tjs |
| allchar / alllayer targeting | `system/KAGEnvironment.tjs` ≈1230 | Re-emits tag only to `isShowBU()` chars unless `force`; FACE busts excluded |
| Position/depth/disposition words | `main/envinit.tjs` ≈258, `extracted_data/envinit.json` | 顔→FACE, 無→INVISIBLE, 左→xpos −200, etc.; times, levels, transitions |
| Character art anchors | `extracted_data/fgimage/charlevel.csv` | level0..3 x/y offsets for 顔分離型 stands; not stage slots |
| Message bust (顔領域） | `system/standview.tjs`, `system/exstand.tjs` (`drawFace`/`getFaceArea` ~1900–2030, `setFace` ~948, `getStandLayer` ~1156), `main/envinit.tjs` `faceLevelName=0` | face-window routing for FACE; 205×200 untrimmed level-0 顔領域 crop, per-stand face lookup (no cross-pose plates), 顔mask |
| Pan macros | `extracted_data/scenario/macro.ks` ≈867–918 | 背景スクロール → `newlay scrl` + opacity/ypos `time` `accel sync` patterns; `beginskip/endskip` |
| Layer registration | `system/KAGEnvImage.tjs` ≈408–490, 1524–1535, 1905–1930; `system/world.tjs` `EnvGraphicLayer.recalcPosition`; `system/AffineLayer.tjs` ≈940 (`left + imageX − afx`); `main/envinit.tjs:188` (`xmax=scWidth/2`) | two-origin placement `screenX = orx + xpos − afxFrac·w`; `origin`→afx/afy image fraction, `vorigin`→orx/ory view origin (default 400/300); event world is nocamera/noshift, simple layers levelz=100 |
| Skip semantics | `KAGEnvImage.tjs isSkip()` | SKIP modes; move times zeroed while skipping; `[cancelskip]` at OP end |
| Skip-range brackets | compiled markers + scenario | `beginskip/endskip` mark *eligible* ranges, never force skip in normal play |
| Gallery/sound lists | game CSV/PSD data | `cgmemory.csv` tile geometry, `sound.csv` rows; canonical `/api/cglist` |
| Message/backlog skins | game uipsd + csv (`message01/02`, `backlog.csv`, `cgmemory.csv`) | 800×600 overlay geometry |
| Cursor hotspot | `lavender.exe` resources | lavender-sprig 32×32 PNG + patched `.cur`, hotspot (16,16) |
| Favicon | `lavender.exe` | byte-faithful `RT_GROUP_ICON`; script `docs/extract_exe_icon.py` |

## Reference pan sequence

`lave.riko2.ks` raw ≈1648–1651 (compiled 1631–1634):

1. `_l` loaded at opacity 0, xpos −200/ypos −400 (cut),
2. opacity → 255 over 1500 ms (no wait),
3. center → xpos 400/ypos 300 over 3000 ms, `accel=-1` (ease-out),
   `sync transwait=500`,
4. base (non-`_l`) file swapped in — cut ending the pan.

Documented implementation: [Event CGs & dynamic layers](../engine/event-layers.md).

## Reference FACE scene

`lave34.ks` around compiled 389–599: after `allchar hide`, every speaking
character returns with `顔` (390 はるか， 405 ヒカル， 422 栗林， 464 レイカ，
468 アキナ， 525 リコ); no bodies are on stage until 栗林's explicit `出`
at 607. Regression test: `resolveCharDisp` "lave34 FACE exchange" case in
`metadata.test.ts`.
