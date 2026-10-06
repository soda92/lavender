# Saves, config & UI conventions

## Save/Load

The modern archives UI (`ArchivesModal`) is kept — we do **not** re-skin to
`saveload.csv`. Slots persist via `/api/save-slot` (SQLite) and contain the
`StageState` snapshot (with transient enter/exit anims and layer pan tracks
stripped; pre-`disp` character states derive `disp` from `visible`).
Quick save/load, slot delete, and a single-session heartbeat lock exist.

## Config / Backlog overlays

Both are **full-stage 800×600 modal overlays inside `.stage-frame`**
(`ConfigOverlay`, `HistoryModal`):

- game stays blocked while open;
- right-click / Esc = 戻る (a nested Yes/No ask owns them until answered);
- BGM continues;
- backlog text region (123,54,608×499) per `backlog.csv`, with per-line
  voice replay and the skin scrollbar.

### Config overlay: HTML reimplementation

The three config pages (`config_system` / `config_sound` /
`config_shortcut`) are pure HTML/CSS — lavender sidebar tabs, white sheet
and a dark shortcut card — not bit-aligned page art. Only two kinds of
authentic bitmap survive (`skin.cfgSoundUrl`):

- the 16 per-character portraits (`人物像%layer;1..16`, CSS-cropped to the
  41×41 face well; the baked name/track strip is hidden);
- the 41×41 red mute glyph (`voice%toggle;off`).

The nested 初期化 Yes/No ask still uses the authentic `dialog` skin.
Every label is i18n'd (`cfg.*` keys); in JP mode rows show the authentic
JP label plus the sheet's small English sub-caption. All `sf` keys and
defaults (`CFG_DEFAULTS`, incl. the unset-state quirks) are unchanged.

## i18n

`i18n.tsx`: English menus with Japanese fallback for missing strings.
**Scenario text and official track titles stay Japanese**; authentic engine
UI labels/assets ship as-is. EN/JP navigator tab labels ("Navigator"/
ページ， opened with `N`).

## Cursor

- Bottom system-bar buttons always show the OS hand cursor; everywhere else
  the design cursors apply — lavender-sprig 32×32 PNGs with a patched
  `.cur` sibling, hotspot fixed **(16,16)** Go-side (`cursor.go`,
  `CURSOR_HOTSPOT`).
- Design cursors off → OS arrow/hand.

## Favicon

Byte-faithful multi-resolution `RT_GROUP_ICON` extracted from
`lavender.exe`; helper: `docs/extract_exe_icon.py`.

## Chapter cards / eyecatch / OP

Authentic `ef_syoutitle_1..4` chapter cards driven through the recursive
macro expander; OP movie only at the prologue end (`lave10.ks` static
idx 2299), where `[cancelskip]` releases skip.

## Debug panel

An optional debug panel surfaces stage information including the currently
playing BGM; see [Debugging & deep links](../developers/debugging.md).
