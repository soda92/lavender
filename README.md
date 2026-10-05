# lavender0 README.md

光輪の町、ラベンダーの少女 — web player (Go backend + React/Vite frontend).

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
