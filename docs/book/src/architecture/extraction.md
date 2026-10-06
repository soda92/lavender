# Extractor & compiler

Code: `lib/extraction/`, entry point `cmd/extractor/main.go`.

## Pipeline pieces

| File | Role |
|---|---|
| `xp3.go` | XP3 archive index + file extraction |
| `cxdec.go` | CXDEC-encrypted stream decoding |
| `tlg.go` | Kirikiri TLG image decode |
| `kagparse.go` | Shift-JIS KAG lexer/parser: tags, attributes, argv tokens, text nodes |
| `macro.go` | `[macro]` definition/expansion, recursive macro calls, `${}`/`&` expansion |
| `scenario.go` | Compiles parsed KAG into the flat JSON instruction model |
| `charinfo.go` | Per-character pose/dress/diff/face manifests, `charlevel.csv`, `operateRect` anchors |
| `envinit.go` | Parses `main/envinit.tjs` (positions, times, levels, transitions, characters) to `envinit.json` |
| `filemap.go` | Builds the media stem → file map (`/meta/file_map.json`) |
| `cursor.go` | Extracts the game cursor set and patches `.cur` hotspots |

## Compiled scenario format

`extracted_data/scenarios/<group>/<storage>.json`:

```json
{
  "name": "lave34",
  "storage": "scenario/lave34.ks",
  "instructions": [ … ]
}
```

`instructions` is a flat array; control flow (`if`, labels, `eval`, macros)
is resolved ahead of time as far as possible. Node types in compiled output:

| `type` | Meaning |
|---|---|
| `command` | A KAG tag: `name`, `args` (attribute map), `argv` (positional/token words) |
| `text` | Spoken/narration text fragment |
| `line_feed` | Line/page break marker |
| `wait_click` | Click boundary (optionally `inline` for `[*]`) |
| `label` | Jump target |
| `eval` | Residual runtime expression (flag conditions the compiler could not fold) |

Example (from `lave34.json`, the background-scroll sequence):

```json
{ "type": "command", "name": "newlay",
  "args": { "file": "bg24_a", "level": "5", "name": "scrl",
            "opacity": "0", "xpos": "0", "ypos": "-150", "zoom": "100" },
  "argv": ["show", "notrans", "sync"] },
{ "type": "command", "name": "scrl",
  "args": { "opacity": "255", "time": "1000" }, "argv": ["nowait"] },
{ "type": "command", "name": "scrl",
  "args": { "time": "500", "ypos": "150", "accel": "-1" }, "argv": ["sync"] }
```

Token words (dispositions `出/立/顔/消/無`, positions `左/右/中/手前/前/奥`,
flags `sync/nosync/nowait/notrans/…`) stay in `argv`; the frontend classifier
maps them through `envinit.json`. Some framework shorthands are normalised to
canonical words (e.g. `allchar` receives `"hide"`).

## Macros

`macro.go` expands the game's `macro.ks` recursively; the background pan
macros (`背景スクロール` family around `macro.ks:867`) expand to the
`newlay scrl` / opacity / `ypos` / `sync` pattern above. The compiler keeps
`beginskip`/`endskip` markers so the runner can decide whether a range is
eligible for fast-forward (see [Skip, seek & replay](../engine/skip-seek.md)).

## Rebuilding

`extracted_data` is served live in dev; after changing compiler code:

```sh
go run ./cmd/extractor -gamedir . -out extracted_data
# macro coverage check: a temp Go test calling compileAllScenarios reports
# 155 macros expanded across 103 scenarios.
```
