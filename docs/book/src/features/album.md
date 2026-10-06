# Album: CG / Scene / Sound

One unified `GalleryScreen` shell with three modes, built on the **authentic
paper skin** (`cgmemory.csv` / `sound.csv` geometry) rather than re-skinned
game saves. Shared elements: one Back tile, rail tabs, and the 4-group
cycling pager.

## CG mode

- 16 tiles per page, sections/categories from `/api/cglist`
  (6 sections, 99 tiles, 13 `stex` overlay composites).
- A tile expands to a **fullscreen cycle viewer**: one slot iterates *all*
  variants of the CG, including locked variants rendered as a dark-violet
  serif `？？？？` placeholder; the counter always shows `n / total` with a
  lock glyph on locked frames; the tile badge shows amber `seen/total` on
  partial unlocks.
- Click / Right / Enter advances; past the last frame closes. The final
  frame's button is *End Scene* (`gallery.endScene`).
- Identical `_l` hi-res frames are dropped (same artwork, not a variant).

## Scene mode

2×2 scene tiles per page from `/api/scenes`; locked scene buttons still
launch (they deep-link into the scenario — spoilers are hidden by the veil,
access isn't).

## Sound mode (`SoundMode.tsx`)

- Two columns × 10 rows per page (20/page), faint row numbers baked into
  the sheet layers.
- Locked rows read `？？？？` and are inert; a currently-playing but
  unseen track reveals its row title (official Japanese titles stay
  untranslated).
- Transport is a compact two-line bar at x205/y85, w567×h40 measured to
  overlap zero rows; Back in Sound mode stops BGM. Modern transport controls
  are the deliberate player addition beside the authentic sheet.

## Modern additions vs. authentic skin

Kept modern: counters, spoiler veil, viewer controls, locked-launch,
heard counter, transport. Everything geometric (tile rects, rail, pager,
sheet rows, chapter cards `ef_syoutitle_1..4`) stays authentic.
