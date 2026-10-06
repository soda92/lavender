# Skip, seek & silent replay

Three "instant" modes share the `instant = fastForward || seeking || silent`
gate used throughout the runner (transitions, layer pans, quake, audio cues):

| Mode | When | Waits honoured? | Animations? |
|---|---|---|---|
| Fast-forward (skip) | hold Ctrl / ▶▶, toggle K | no — read-ahead until unskippable | zero duration |
| Seek replay | deep link cold load, navigator jump, debug `seekToPointer` | **silent** — no sound, no shake, auto-first choices, cross-file cancels | zero duration |
| Silent | the seek-replay pass itself | none | none |

## Fast-forward

Hold-to-run controls: **Ctrl** keydown (ignore repeat)/keyup/window blur and
the **▶▶** pointer-capture hold run fast-forward; **K** toggles; `Ctrl+S/L`
cancel it. Start/stop is idempotent and only valid from `PLAYING` state.
The OP movie is force-unskippable: `lave10.ks` static index 2299 emits
`[cancelskip]`, releasing fast-forward there.

## `beginskip` / `endskip`

These tags **do not toggle skip mode** — they bracket a range that *may* be
fast-skipped. In normal play the contents run normally (and `sync` pans
inside the block block the script, e.g. the dojo scroll). Only when the
player is actually skipping do transitions/waits inside become zero-time.
`rangeSkipRef` marks range membership but must never by itself suppress
motion.

## Seek = silent replay

A seek (including the `#/scenario/<storage>/<ptr>` cold load) does not jump
straight to the instruction:

1. stage resets to `EMPTY_STAGE`,
2. `silentRef = true`, `seekRef = target`,
3. `runSlice()` replays **from file start** with no sound, no stage shake,
   animations zeroed, choices auto-first;
4. it lands at the nearest `wait_click` **≤ target**
   (a seek into the second half of an inline `[*]` line keeps the page
   open so the next click appends);
5. cross-file jumps during replay cancel the seek; BGM/video are skipped;
6. `finishSeek()` clears the flags, reveals any open trans block as a cut,
   commits and waits for the next click.

Compiled **instruction indices** are the seek currency; they differ from
raw `.ks` line numbers (macros expand). The hash breadcrumb shows the
compiled pointer.

## Trans buffered across a seek

A seek boundary landing inside an open `begintrans` reveals the draft as a
cut instead of a partial crossfade.

## Leave/enter snapshot pruning

"Leaving" char snapshots exist for per-char crossfades outside trans blocks;
prune timers are cleared on seek (the new stage starts clean), and pan
tracks / char enter-exit anims are stripped from save-restore snapshots.
