# Flags, points & branching

The game has no scripting VM of its own beyond KAG tags: all story state is
a handful of properties on predefined variable objects. The complete game
contains only **16 distinct expressions** — the point system is deliberately
sparse.

## Variable scopes

Scripts never declare variables; they read and write properties directly.

| Scope | Meaning | Lifetime | In the runner |
|---|---|---|---|
| `f.*` | **Game flags** — heroine affection points, route state | one playthrough, stored in every save slot | `fRef` → `SaveSlot.f` |
| `sf.*` | **System flags** — endings cleared, CG/BGM unlocks, settings | global, across all playthroughs | `sfRef`; localStorage `<prefix>_sf` + `POST /api/save-sf` |
| `tf.*` | **Temporary flags** — scratch values for the current run | reset on New Game | `tfRef` → `SaveSlot.tf` |
| `mp.*` | **Macro parameters** passed to a user macro (`mp.msgon`, `mp.nostopbgm`, …) | one macro call | sandbox argument `{}` |

Expressions also see a read-only `kag` object (`kag.skipMode`,
`kag.isRecollection`) and the constants `SKIP_NONE` (0), `SKIP_ALL` (1),
`SKIP_CANCEL` (2), `SKIP_NOWAIT` (3).

## Where expressions occur

The Go compiler turns Kiri2 attribute expressions into instruction fields:

- `[eval exp="f.riko+=2"]` → an `eval` instruction (`exp`) — a side effect.
- `[stopbgm cond="!mp.nostopbgm"]` → `args.cond` gates the command.
- `[link eval="f.lave38==1" target="*x"]` / `[next eval="…"]` → conditional
  label branches.
- Attributes prefixed with `&` are expression attributes; `&@"…${expr}…"` is
  a here-string with interpolations, used for variant artwork such as
  `ev_riko_h_05a${f.rikoh_suffix}_l`.

Evaluation lives in `web-app/src/hooks/useKagRunner.ts`:

- `sandboxEval()` (~line 209) runs the expression in
  `new Function('f','sf','tf','kag','mp', …)`, after stripping Kiri2 `&`
  prefixes. Because the scopes are plain JS objects, dynamic access like
  `sf[tf.rollflag]` works natively.
- `expandKagArg()` (~line 241) handles `&expr` and `&@"…${…}…"` forms.
- Command gating: `args.cond` / `args.eval` are evaluated before the command
  runs; `eval` instructions execute via `sandboxExec`.
- During silent replay (hash load / navigator seek), `[select]` choices
  auto-take the **first** option, so its branch (and any points it awards)
  is what the seek replays.

## Choices award points through label branches

Canonical pattern (`lave01`, Riko karaoke choice):

```text
[seladd target=*lave01-01 text="「そうだなぁ。昨日やってた、ＴＶ番組とか？」"]
[seladd target=*lave01-02 text="「やっぱり、お前の好きな動物の話がいいよ！」"]
[select]
*lave01-01
  …branch A dialogue…
[next target=*lave01-03]        ; fall-through skips the other branch
*lave01-02
[eval exp="f.riko+=2"]          ; branch B awards points
  …branch B dialogue…
*lave01-03
  (rejoin)
```

The selected option jumps to its label; the unchosen label is skipped by the
trailing `[next]`.

### Complete point-award table

| File | Expression | Award |
|---|---|---|
| lave01 | `f.riko+=2` | +2 Riko |
| lave02 | `f.hikaru++` | +1 Hikaru |
| lave03 | `f.reika+=2` | +2 Reika |
| lave09 | `f.haruka++` | +1 Haruka |
| lave33 | `f.riko++` / `f.reika++` / `f.akina++` | +1 each |
| lave34 | `f.akina+=2` | +2 Akina |

Reachable maximums: Riko 3, Reika 3, Akina 3, Hikaru 1, Haruka 1. Most route
gating is structural (which scenes are visited) rather than score-driven.

## Route decision: the `lave40` ladder

`lave40` (instructions 1148–1152) picks the heroine route from the five
counters with a fixed priority order:

```text
f.hikaru >= f.haruka && >= f.riko  && >= f.reika && >= f.akina  → *lave40_hikaru
f.haruka >  f.hikaru && >= f.riko  && >= f.reika && >= f.akina  → *lave40_haruka
f.riko   >  f.hikaru && > f.haruka && >= f.reika && >= f.akina  → *lave40_riko
f.reika  >  f.hikaru && > f.haruka && > f.riko  && >= f.akina   → *lave40_reika
(no condition)                                                  → *lave40_akina
```

Tie-breaking is deliberate: Hikaru wins all ties (`>=`), Haruka/Riko/Reika
must strictly beat everyone listed above them, and **Akina is the
unconditional fallback** — the main-heroine route you get even when every
counter is 0.

## Other game flags (`f.*`)

- `f.lave38` (1…5) is a chapter **state machine**, not affection: five
  assignments in `lave38` choose among five `[next eval="f.lave38==N"]`
  epilogue vignettes.
- `f.rikoh_suffix` (`'a'`, set in `lave.riko2`) selects an H-scene artwork
  variant through `&@"…${f.rikoh_suffix}…"` interpolation.

Scratch examples in `tf.*`: `tf.eyecatchskip` (skip eyecatches when already
in skip mode), `tf.rollflag` (`"staffroll_"+mp.bgm`), `tf.rollskip`.

## System flags (`sf.*`) and unlocks

Gallery modes are **heard-/seen-gated**: every mode page checks
`tf.allseen || sf[seenflag]` (`sysscn/soundmode.tjs:131`, `cgmode.tjs:551`,
`scenemode.tjs:91`). The per-item flag defaults to `bgm_<STEM>` / the
`seenflag` CSV column, and `KAGEnvBGM.tjs:78` sets `sf["bgm_"+stem]=true`
whenever a `[bgm]` macro plays — including the title hook
(`custom.ks *title_bgm` plays `[bgm01b]`), so the title track is unlocked
from the first visit. Locked rows render `？？？` and are disabled.

- **Ending flags** — the last chapter of each route sets one of
  `sf.akina` / `sf.haruka` / `sf.hikaru` / `sf.reika` / `sf.riko` to `1`
  (`lave.akina4`, `lave.haruka3`, `lave.hikaru3`, `lave.reika3`,
  `lave.riko3`). These gate scene-recollection access. A recollection replay
  is marked by `kag.isRecollection`; e.g. `lave.riko2` guards a `[next]`
  with `!kag.isRecollection` so replays do not re-run first-time effects.
- **Music room** — ending scenes run `sf.bgm_BGM27=true` and then
  `sf[tf.rollflag]=true`, marking the staff-roll track heard.
- **CG gallery** seen-state is maintained by our runner as `cgSeen` /
  `bgmSeen` maps inside `sf`.
- `sf.clear=true` is set from `start.ks` (New Game entry).
- **`tf.allseen`** ("鑑賞モード全ON") is a *session-only* checkbox in the
  engine's debug menu (`Override.tjs:1060`) that simultaneously unlocks CG,
  Scene, and Sound modes plus extras. The web port exposes the same master
  switch as the modern **Reveal all** pill in the album, but persists it as
  `sf.allSeen` (`game/seenGate.ts`, predicate `itemSeen`/`anySeen`).
  The title screen also marks its track heard explicitly because it starts
  BGM directly (`TitleScreen` → `markBgmSeen`) rather than through a
  scenario `[bgm]` command. Authentic title music is `bgm01b`
  （光の輪の町）, via `custom.ks *title_bgm`; `bgm01a` （ラベンダーの少女）
  is the OP-vocal track.

## Persistence

- `buildSaveData()` snapshots `f`/`sf`/`tf` together with the stage and
  pointer into each save slot; loading restores them and resumes ordinary
  interpretation — flags are never re-derived. Missing scopes in legacy
  saves default to `{}`.
- `sf` is additionally persisted on its own (debounced): locally in
  `localStorage` and server-side per user via `/api/save-sf`, so gallery /
  ending unlocks survive without a slot save. Hydration layers
  defaults → localStorage → server (`game/sfMerge.ts`); the server wins per
  leaf but the local copy fills gaps, so a POST rejected by heartbeat
  ownership does not lose local-only changes on reload.

See also [Skip, seek & replay](./skip-seek.md) for how branches replay
during seeks and [Saves, config & UI](../features/saves-ui.md) for slot
storage.
