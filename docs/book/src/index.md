# Lavender web player

『光輪の町、ラベンダーの少女』 (*Lavender*, Akabei Soft2, 2008) reimplemented as a
web visual-novel player. The original Windows/KiriKiri (KAG) game data is
extracted and compiled to JSON by native Go tooling; a Go/Gin + SQLite server
serves it to a React 19 / Vite frontend that interprets the compiled scripts
and reproduces the Akabei engine's rendering semantics in the browser.

The player is a Lavender-native sibling of the G-senjou web player; the
framework internals were re-derived from the game's own KAG/TJS system scripts
and assets, not from the reference binary.

## What lives where

| Path | Purpose |
|---|---|
| `cmd/extractor`, `lib/extraction` | XP3 archive reader, CXDEC decode, TLG images, KAG parser, macro expander, scenario compiler, metadata extraction |
| `cmd/server` | Gin server: game data, saves/SQLite, CG/Scene/Sound lists, dev Vite supervisor |
| `web-app/` | React 19 + Vite player (KAG interpreter, renderer, album, saves) |
| `extracted_data/` | Extracted game assets and compiled `scenarios/**/*.json` (served live by the dev server) |
| `disc/` | The original disc image contents (source data, not shipped) |
| `docs/` | Extraction helper scripts and this book (`docs/book`) |

## Rendering philosophy

Everything is drawn inside one **800×600 `.stage-frame`** (CSS-scaled to fit):
background, body+face composite sprites, dynamic event layers, dialogue and
overlays. The runtime never pre-renders character combinations — sprite
artwork ships as separate **body** and **face** PNG layers and is composited
per frame from manifests (`characters.json`, per-pose layer lists with
`operateRect` anchors). Where the original engine distinguishes states the
2008 renderer expressed implicitly (character dispositions, `_l` hi-res art,
scripted pans), the model keeps the engine's data model explicit instead of
flattening it into "show one picture".

The [Engine semantics](./engine/script-model.md) chapters document these
decisions; [Engine source references](./developers/engine-references.md)
points at the exact TJS system files each rule was derived from.

## Reading order

1. [Getting started](./getting-started.md) to run the stack.
2. [Architecture overview](./architecture/overview.md) for data flow.
3. The Engine chapters for rendering details — start with
   [Characters & sprites](./engine/characters.md) and
   [Event CGs & dynamic layers](./engine/event-layers.md), the two areas
   where naive reimplementation goes wrong.
