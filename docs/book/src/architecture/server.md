# Go server

Code: `cmd/server/`, handlers in `pkg/handlers/`, persistence in `pkg/db/`.

## Responsibilities

- Serve the compiled scenarios, metadata JSON and extracted assets.
- Save slots, quick-save/load and per-user settings (`pkg/db`, SQLite).
- Canonical gallery and sound-room indexes derived from data on disk.
- In `-dev`: supervise the Vite dev server and proxy asset/API requests.

## HTTP surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/scenarios` | Scenario storage index |
| GET | `/scenarios/…/*.json`, `/meta/*`, `/fgimage/*`, `/bgimage/*`, `/evimage/*`, `/bgm/*`, `/sound/*`, `/voice/*`, `/uipsd/*` | Game data & media |
| GET | `/api/cglist` | Canonical CG gallery model (6 sections, 99 tiles, 13 stex overlays) |
| GET | `/api/scenes` | Scene gallery metadata |
| GET | `/api/soundlist` | BGM list parsed **Shift-JIS server-side** (35 entries) |
| GET | `/api/media` | Media existence/lookup |
| GET | `/api/state` | Hydrate saves/settings |
| POST | `/api/save-slot`, `/api/delete-slot` | Save slots |
| POST | `/api/save-sf` | Settings flags |
| POST | `/api/heartbeat` | Single-session lock (returns `conflict`) |
| POST | `/api/dev/restart-vite` | Restart the supervised Vite process (dev only) |

`/api/cglist` is the canonical source for the album; the frontend filename
heuristic remains only as a fallback. See `pkg/handlers/cglist.go` and its
tests for tile/variant/overlap (`stex`) rules.

## Dev Vite supervisor

`devvite.go` (+ `devvite_unix.go` / `devvite_windows.go`):

- Spawns `pnpm dev` as its own **process group** (`Setpgid`).
- Shutdown escalates `SIGTERM` → `SIGKILL` (`taskkill /T /F` on Windows).
- Readiness is gated on TCP :38942 before the backend reports ready.
- The frontend talks to Vite :38942; `/api`, `/meta`, `/scenarios` and asset
  directories proxy to the Go backend on :38080.
- `POST /api/dev/restart-vite` tears down and respawns Vite without
  restarting Go (used when HMR gets wedged on stale immutable module URLs).

## Encoding notes

Source lists such as the sound list ship Shift-JIS; decoding happens in Go
(`soundlist.go`) so the frontend always receives UTF-8 JSON.
