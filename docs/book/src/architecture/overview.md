# Architecture overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Original game data                        │
│  XP3 archives · TLG images · Shift-JIS .ks scripts · TJS     │
└────────────────────────────┬─────────────────────────────────┘
                             │ go run ./cmd/extractor
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  lib/extraction — native Go pipeline                         │
│  xp3/cxdec → tlg → kagparse → macro → scenario compiler      │
│  charinfo · envinit · filemap · cursor extraction            │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
│                 extracted_data/  (assets + JSON)             │
│                             │
│           ┌─────────────────┴──────────────────┐
│           ▼                                    ▼
│  ┌────────────────────┐             ┌───────────────────────┐│
│  │ cmd/server (Gin)   │◄────────────│ web-app (React/Vite)  ││
│  │ SQLite saves · API │   fetch     │ useKagRunner hook     ││
│  │ static / media     │             │ Stage renderers      ││
│  │ -dev: Vite parent  │────HMR──────▶ 800×600 .stage-frame  ││
│  └────────────────────┘             └───────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

## Three layers

### 1. Extraction & compilation (Go)

The original game ships Kirikiri KAG scripts (Shift-JIS `.ks`) plus the
Akabei framework TJS in `system/`, `main/` and `sysscn/`. The Go pipeline:

1. **XP3** — reads archives and applies CXDEC stream decryption.
2. **TLG** — decodes Kirikiri's native image format to usable PNGs.
3. **KAG parse** — tokenises `.ks` into tags, text and control nodes.
4. **Macro expand** — resolves `[macro name=…]` definitions (155 macros,
   103 scenarios) and attribute/string expansions, e.g.
   `file="&@\"ev_riko_h_05a${f.rikoh_suffix}_l\"`.
5. **Compile** — emits a flat instruction array consumed by the web runner.

The compiler also normalises framework commands: for example `[allchar hide]`
is emitted as a single `allchar` command carrying `argv: ["hide"]` rather than
being expanded per character (the semantics of which characters the original
engine re-targets are reproduced in the runner — see
[Characters & sprites](../engine/characters.md)).

### 2. Server (Go / Gin / SQLite)

Serves compiled scenarios and assets, persists saves/settings, and provides
canonical gallery/sound indexes. In `-dev` it also owns the Vite process
group (see [Go server](./server.md)).

### 3. Frontend (React / Vite)

`useKagRunner.ts` is the KAG interpreter; `GameplayScreen.tsx` and friends
render the 800×600 stage. Metadata and asset manifests are fetched once from
`/meta` and cached by `metadata.ts` (see [Frontend](./frontend.md)).

## Design constraints

- **One stage frame, scaled, never routed.** The player uses hash breadcrumbs
  (`#/scenario/<storage>/<ptr>`, via `replaceState`) purely as debug
  deep-links; there is no client router.
- **Runtime compositing.** No character combination is ever rasterised ahead
  of time; body+face layers are composited live from manifests.
- **Engine fidelity over convenience.** Dispositions, transitions, pan timing
  and skip/seek behaviour follow the Akabei TJS even where a simpler approach
  would "look fine". TJS-derived rules are documented inline in comments
  citing the source file.
- **Modern UI lives in the album/config shell**, never in the game stage:
  spoilers, paging and transport are player additions layered beside
  pixel-faithful game skins.
