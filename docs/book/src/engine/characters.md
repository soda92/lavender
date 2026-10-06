# Characters & sprites

Characters are composited at runtime; the engine never ships a sprite per
costume/expression combination.

## Art composition

A rendered character is a **body** PNG plus a **face** PNG chosen from
manifests (`characters.json`):

- tag tokens select costume (dress), pose, diff (variant), face expression;
- `renderCharacter()` resolves the exact part list. When the requested diff
  or face is **not declared for the requested pose**, the whole stand
  switches to the first pose (charinit.csv order) that declares it — see
  [stand resolution](#stand-resolution-diff--face-pose-switching);
- `spriteComposite.ts` paints body+face to a canvas.

**顔分離型** (separate-face) stands use `operateRect` and `charlevel.csv`
anchors to register the face layer at the correct per-level offset
(`charlevel.csv` columns are level0..3 x/y adjustments, not stage slots).

## Stand resolution (diff & face pose switching)

`exstand.tjs` applies a character tag in dress→pose→diff→face order. A diff
or face missing from the current pose does not borrow a layer: the ENTIRE
stand changes to the first pose (charinit.csv enumeration) declaring it for
the current dress; `checkDiffFace()` finally defaults an invalid/omitted
face to `faceList[0]`. Pure implementation: `game/standResolve.ts`
(`resolveStand`), table-tested in `standResolve.test.ts`, consumed by
`renderCharacter` for every level.

Postmortem of the bug this replaced: the port used to graft another pose's
face plate onto the requested pose's body ("cross-pose fallback"). Plates
are opaque 102×83-ish face tiles in per-pose coordinates and bodies have a
transparent face hole, so e.g. はるか ポーズＢ+すまし painted ポーズＡ's plate
at Ａ's coords over Ｂ — an opaque rectangle over the head (lave43/73).


## Dispositions (KAGEnvImage)

The single most important framework rule. Every character tag carries an
optional DISPPOSITION token from envinit:

| Token | Const | Body on stage | Meaning |
|---|---|---|---|
| 出 | `BOTH` | yes | bust-up + face (standard) |
| 立 | `BU` | yes | bust-up |
| 顔 | `FACE` | **no** | message-window bust only |
| 消 | `CLEAR` | no | erased; a later pose/position tag auto re-shows |
| 無 | `INVISIBLE` | no | suppressed; later tags do **not** re-show |
| — | `SHOW` (auto) | — | tag with no disposition keeps current state; if CLEAR and the tag changes art/position, becomes BOTH |

Source: `system/KAGEnvImage.tjs` (`disp` setter, `isShowBU/isShowFace`),
`system/KAGEnvCharacter.tjs` (`setPose/setDress/setFace/setPosition` set
`disp = SHOW`; the setter resolves SHOW against the current state).

### Why this exists (the lave34 bug)

A rapid dialogue scene tags every girl with `顔` after an `allchar hide`.
The authentic stage has **zero bodies**: each speaker appears only as the
soft-masked 顔領域 bust in the message window. A naive "any pose tag shows the
sprite" implementation stacked six characters on their last x-slots.

Runtime model (`CharState.disp: 'both'|'bu'|'face'|'clear'|'invisible'`):

- body visibility = both/bu only; `visible` is derived,
- `resolveCharDisp(current, explicit, touched)` is the pure state machine
  (unit-tested in `metadata.test.ts`),
- bare tags preserve `face`/`invisible`/`both`; only `clear` auto-promotes,
- switching BOTH→FACE plays the body's exit transition (it leaves the stage;
  the bust takes over),
- pre-`disp` saves derive the value from `visible` on restore.

### `allchar hide`

The engine re-emits the hide tag **only to currently body-showing layers**
(`isShowBU()`), so FACE busts survive it. Implemented as
`allcharHideDisp()`: both/bu → clear, everything else untouched.

## Positions and depth

- x-slots come from envinit `XPOSITION` words: `左 −200`, `中 0`, `右 200`,
  plus 外/中/250/300 variants and numeric `xpos=`.
- Depth words are `LEVEL`: `奥 0`, `前 1`, `手前 2`; `front`/`back`
  re-order within level.
- A position/level token on a CLEAR char also auto-shows it (engine
  `setPosition` sets `disp = SHOW`).

## Message-window bust (MiniFace / 顔領域）

FACE (and BOTH when `env.bothFace`) speakers contribute a **205×200 crop** of
the level-0 stand's `顔領域` marker (or `<dress>顔領域`), clipped through the
authentic `顔mask%layer.png`. It is independent of the message-window skin:
the bust renders in both the normal `message01` window and the modern
immerse-mode pill, at the same stage coordinates (left 0, window top 399).

The level-0 page is its **own authored 205×200 bust canvas** — not a trim of
the on-stage page (`envinit.tjs`: `faceLevelName = 0`; `exstand.tjs`
`drawFace` → `getStandLayer(pose, 0)` → `getFaceArea`). Body and expression
plate are composited on that full, untrimmed canvas at their raw manifest
coordinates and the marker rect indexes it 1:1. Two consequences:

- Per-pose face coordinates differ and each body sheet has a **transparent
  rectangular face hole**, so a face plate can never be transplanted from
  another pose. `exstand.tjs` `setDiff`/`setFace` instead switch the **whole
  stand** (`currentDiffNameMap`/`currentFaceNameMap`): e.g. はるか ポーズＢ
  +すまし silently renders ポーズＡ (the first pose declaring すまし for that
  dress), body included — at every level, including the level-0 bust.
  `checkDiffFace()` then defaults an invalid/omitted expression to the
  stand's first declared face (`faceList[0]`) so the hole is never empty.
  Corpus audit: 13 face switches, 0 diff switches (scripts pair diffs with
  compatible poses); the message01 `フレーム%layer.png` decorative tile can
  only show through if a stand genuinely has no declared faces at all.
- The on-stage union-bounds trim (page `x/y`) must never be applied to the
  bust source; doing so shifts every bust crop up-left by the trim origin.

`RenderedSprite.facePage` carries the untrimmed descriptor
(`w/h`, raw `body`/`face`, marker `rect`); `paintSpriteFace` consumes it.

## Transitions

Pose/dress/diff/face **changes cut instantly**. Enter/exit (show/hide) honor
the named transition token or `charDispTrans` (default 300 ms crossfade;
スライド ±100 px 200 ms), driven imperatively via WAAPI so they are
cancellable. All transition times are zero while skipping or seeking — see
[Transitions & motion](./transitions-motion.md).

## Identity

- `stage.chars` is keyed by **Japanese display name**; `newchar` aliases
  resolve through envinit `nameAlias` (`resolveRegisteredName`).
- Voice stems are bare and route through the 4-bus audio layer.
