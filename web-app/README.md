# Lavender web player

React 19 + Vite frontend for 『光輪の町、ラベンダーの少女』. Forked and adapted
from the G-senjou player; all game data is fetched at runtime from the Go
server instead of being imported as static JSON.

## Layout

- `src/game/metadata.ts` — loads `/meta/{file_map,envinit,characters}.json`
  and `/api/scenarios`; resolves backgrounds, media stems, scenario
  storage paths, and body+face sprite layer composition (with cross-pose
  face fallback).
- `src/hooks/useKagRunner.ts` — KAG interpreter for the compiled scenario
  JSON: flow control (`next`/`fastskip`/labels/`eval`), choices
  (`seladd`/`select`), stages/time, characters, dynamic layers (`newlay`),
  BGM/SE/voice, chapter cards, auto/skip, history and saves.
- `src/hooks/useGameAudio.ts` — singleton BGM/SE/voice elements.
- `src/components/` — title, gameplay stage, history, settings, saves,
  CG gallery, music room.

## Develop

```sh
# backend (serves extracted_data + API on :8080 by default)
go run ./cmd/server -dev

# frontend dev server (proxies /api /meta /scenarios and asset dirs)
pnpm install
pnpm dev   # http://localhost:38942
```

## Production build

```sh
pnpm build
go run ./cmd/server    # serves web-app/dist and the game data
```
