# 光輪の町、ラベンダーの少女 — web player

A from-scratch web port of the Akabei/KiriKiri KAG visual novel: a native Go
extractor/compiler and Gin+SQLite server, with a forked React 19 + Vite player
that reimplements the engine semantics (script model, stage/camera, sprite
compositing, transitions, skip/seek replay, saves, and the CG / Scene / Sound
album).

## Running

Production mode (serves the built frontend from `web-app/dist`):

```sh
go run ./cmd/server              # http://localhost:8080
```

Dev mode with Vite HMR — the Go server runs on :38080 and spawns `pnpm dev`;
open the Vite URL, frontend edits hot-reload while API/media requests proxy
to the Go server:

```sh
go run ./cmd/server -dev         # http://localhost:38942
# or: (cd web-app && BACKEND_PORT=38080 pnpm dev) with the server on :38080
```

Other flags: `-port`, `-data ./extracted_data`, `-gamedir .`,
`-no-browser`, `-extract` (run extraction then exit).

## Tests

```sh
go test ./...
(cd web-app && pnpm test)        # vitest
```

## Layout

- `cmd/server` — server entry point (also runs/supervises Vite in dev).
- `pkg/` — extractor/compiler, HTTP handlers, SQLite storage, metadata.
- `web-app/` — React/Vite player (`src/game` for pure engine modules,
  `src/hooks` for the KAG runner, `src/components` for UI).
- `extracted_data/` — compiled scenarios, assets and engine reference files.
- `docs/book/` — mdBook documentation (source only; built HTML is gitignored).

## Documentation

Architecture and engine-fidelity notes live in an mdBook under
[`docs/book`](docs/book/src/SUMMARY.md): compiled script model, flags/points,
stage & camera, character stands, event layers, transitions/motion,
skip/seek, audio, the album, and developer playbooks (debugging, rare-frame
triage).

```sh
mdbook serve docs/book           # live preview at http://localhost:3000
mdbook build docs/book           # outputs docs/book/html/
```

Start at [`docs/book/src/index.md`](docs/book/src/index.md).
