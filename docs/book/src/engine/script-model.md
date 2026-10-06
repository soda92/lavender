# Compiled script model

The runner executes a flat array of instructions (compilation details:
[Extractor & compiler](../architecture/extraction.md)).

## Slice execution

One user click = one **slice**: `advance()` processes instructions from the
current pointer until the next `wait_click` boundary:

- `text` accumulates into the page (typewriter), including the inline
  `[*]` form — an inline `wait_click` reveals more text on the same page
  rather than clearing it.
- `command` is dispatched in `handleCommand` / `handleCharacterTag`.
- Waits (`time=`, `sync`, transitions) are awaited inside the slice; the
  click boundary always lands after them.
- Choices (`seladd`/`select`) suspend the slice with `choiceOptions`.

Seeking a deep link replays the file silently up to the nearest boundary
≤ target (see [Skip, seek & replay](./skip-seek.md)).

## Command families

| Family | Examples | Notes |
|---|---|---|
| Stage | `bg`, named stages (`公開` etc.), `stime`, `bg_c_black` | background stem + time-of-day; camera args on the tag |
| Character | JP name tags (`ヒカル`, `リコ`, …) | argv tokens classified via envinit; see [Characters](./characters.md) |
| Event/layer | `ev`, shorthand `ev_<stem>`, `newlay`, named re-address, `alllayer`, `hideevent` | single event layer + named layers, see [Event CGs](./event-layers.md) |
| Transitions | `begintrans`/`endtrans`, named transitions | buffered whole-stage crossfades |
| Flow | labels, `eval`, `if` (mostly compile-folded), `next`/jumps, `select` | |
| Audio | `bgm*`, `se*`, voice via `&` expansion | [Audio](./audio.md) |
| Skip control | `beginskip`/`endskip`/`cancelskip` | mark fast-forwardable ranges |
| System | `msgoff`, `quake`, movies, chapter cards, eyecatch, no-ops | framework housekeeping |

## Macro and attribute expansion

Macros are expanded at compile time (e.g. the scroll-pan macro family).
String attributes are expanded in two forms visible in compiled JSON:
`${f.flag}` substitutions and `&@"…"` quoted expressions (e.g. event file
suffix flags such as `f.rikoh_suffix`).

## Character tag anatomy

```
[リコ 防具 ポーズＢ 基本 喜び 顔]
```

words are not attributes — they are positional tokens classified through
envinit + the character manifest: costume (dress), pose, diff (variant),
face expression, x-position, level (depth) and **disposition**. Their order
is semantically irrelevant except that an explicit disposition token always
sets the final disposition of that tag. See
[Characters & sprites](./characters.md) for the state machine.
