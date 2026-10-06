# Getting started

## Prerequisites

- Go (toolchain per `go.mod`)
- Node.js + `pnpm` for the frontend
- Game data already extracted to `extracted_data/` (committed in this checkout)

## Extract / compile game data

```sh
go run ./cmd/extractor -gamedir . -out extracted_data
# or via the server flag:
go run ./cmd/server -extract        # extract then exit
```

The extractor reads the XP3 archives (`lib/extraction/xp3.go`, CXDEC in
`cxdec.go`), decodes TLG images to PNG (`tlg.go`), parses KAG `.ks` files
(`kagparse.go`), expands macros (`macro.go`) and compiles each scenario to
`extracted_data/scenarios/<group>/<storage>.json`.

## Run

Production mode (serves the built frontend from `web-app/dist`):

```sh
(cd web-app && pnpm build)
go run ./cmd/server                # http://localhost:8080
```

Dev mode (Go on :38080, spawns and supervises `pnpm dev` on :38942 with HMR;
open the Vite URL):

```sh
go run ./cmd/server -dev -no-browser
```

The dev server serves `./extracted_data` live, so recompiling a scenario and
hard-reloading the page is enough to pick up changes. Restart the Vite
supervisor without restarting Go:

```sh
curl -X POST http://localhost:38080/api/dev/restart-vite
```

Other flags: `-port`, `-data ./extracted_data`, `-gamedir .`, `-no-browser`.

## Tests

```sh
go test ./...
(cd web-app && pnpm test)          # vitest
(cd web-app && npx tsc --noEmit)
```

## Frontend scripts

From `web-app/`: `pnpm dev`, `pnpm build`, `pnpm test` (watch mode),
`npx vitest run` (single run).
