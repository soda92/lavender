# Debugging & deep links

## Hash breadcrumbs

No client router. The URL hash is a debug breadcrumb updated with
`replaceState`:

```
http://host/#/scenario/<storage>/<compiled-pointer>
http://host/#/<storage>/<compiled-pointer>
```

Cold-loading a hash silently replays the scenario to that pointer
([Skip, seek & replay](../engine/skip-seek.md)). Pointers are **compiled
instruction indices**, not raw `.ks` line numbers (macros expand).

DOM debug attributes: `data-scenario`, `data-pointer` on the stage.

## `window.__lavender`

Replaced every render; exposes runner state/actions including
`stage`, `speaker`, `advance()`, `seekToPointer(n)`,
`startFastForward()/stopFastForward()`, `scenarioInstructions`.

Caveats learned the hard way:

- Reads can race a render commit after `advance()`; settle ~500 ms or toggle
  state, and re-read per call.
- Synthetic `.click()` bypasses `pointer-events`; verify click handling with
  real CDP clicks or a bubbling `MouseEvent` on the target.
- In Code Mode / CDP there is no top-level `setTimeout` in evaluate snippets
  (await inside the function string); screenshots save to e.g.
  `/tmp/opencode/x.png` (image read tool fails below 14 px).

## Dev stack cheat sheet

```sh
go build -o /tmp/opencode/lavender-server ./cmd/server
/tmp/opencode/lavender-server -dev -no-browser   # backend :38080, Vite :38942
curl -X POST http://localhost:38080/api/dev/restart-vite
```

- The server serves `./extracted_data` live; warm JSON/PNG caches with
  `fetch(url, { cache: 'reload' })`.
- Wedged HMR (stale immutable module URLs survive ignore-cache reload):
  restart Vite, then open a fresh `?x=` query page.
- Restart stacks by killing explicit PIDs — never `pkill -f vite`, which can
  kill the calling shell.

## Debug timing

`game/debugTiming.ts` provides `useDebugTimeScale()` / `debugMs()` to inspect
transitions and pans in slow motion; WAAPI durations multiply by the live
scale.

## Audits

`docs/scenario_audit.txt` is the corpus-wide tag census (103 scenarios,
860 distinct tags by class) used when deciding coverage of framework tags.
