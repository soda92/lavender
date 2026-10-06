# Audio

`useGameAudio.ts` runs four independent `<audio>` buses:

- **BGM** — streamed `/bgm/*`, cue stems expanded through the `&`
  attribute convention; the debug BGM panel shows the currently playing
  cue.
- **SE** — `/sound/*` one-shots.
- **Voice** — bare voice stems on character tags; `voiceCut` semantics
  interrupt the current voice on the next line, and per-character
  mute/gain flags apply.
- **Movie/OP** — the prologue OP plays only at `lave10.ks` static idx 2299.

## Mixing

- **bgmDown ×0.35**: BGM ducks under voice per config.
- Per-character voice gain/mute is stored in settings flags.
- During silent seek replay and fast-forward, audio commands update state
  (the debug panel/seen flags) but make no sound; the last BGM cue wins so
  the UI reflects where the seek lands.

## Seen tracking

BGM/SE heard flags drive the music-room lock state; the current-but-unseen
track reveals its own row title when it plays.

## Sound list

`/api/soundlist` parses the original Shift-JIS list server-side (35 entries);
the frontend receives UTF-8 JSON and never does encoding detection itself.
