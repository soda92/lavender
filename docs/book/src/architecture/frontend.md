# Frontend

Code: `web-app/src/`.

## Module map

```
src/
├─ hooks/
│  ├─ useKagRunner.ts      # KAG interpreter + game state (the engine core)
│  └─ useGameAudio.ts      # singleton <audio> buses
├─ game/
│  ├─ metadata.ts          # /meta manifests, token classifier, sprite spec
│  ├─ spriteComposite.ts   # body+face canvas compositing + 顔領域 bust crop
│  ├─ skin.ts              # authentic UI asset coordinates (uipsd csv-derived)
│  ├─ cgGroups.ts          # CG tile grouping for the album
│  ├─ scenes.ts            # scene-entry model for the Scene album
│  ├─ transitionCapture.ts # begintrans/endtrans draft buffering
│  ├─ i18n.tsx             # EN menus with JP fallback; game text stays JP

│  └─ debugTiming.ts       # debugMs() time scale
└─ components/
   ├─ GameplayScreen.tsx   # .stage-frame: bg, CharacterView, LayerView, MiniFace
   ├─ GalleryScreen.tsx    # CG/Scene/Sound modes share one shell
   ├─ SoundMode.ts         # authentic sound.csv music room + transport
   ├─ ConfigOverlay.tsx    # full-stage 800×600 modal
   ├─ HistoryModal.tsx     # backlog overlay
   ├─ ArchivesModal.tsx    # save/load (modern UI, not saveload.csv)
   ├─ PageNavigator.tsx    # scenario label/page seek (N)
   ├─ TitleScreen.tsx
   ├─ SidePanel.tsx, DebugPanel.tsx, SkinDialog.tsx
```

## The runner hook

`useKagRunner` owns a mutable `stageRef` (`StageState`) plus React state
mirrors. Script execution happens in async **slices**: an `advance()` runs
instructions until the next `wait_click`, awaiting tagged waits
(`sync`/transitions) along the way. See
[Compiled script model](../engine/script-model.md) and
[Skip, seek & replay](../engine/skip-seek.md).

`StageState` roughly:

```ts
{
  bg: { stem, time }, bgHidden, bgEffect: { zoom, xpos, ypos, … }, quake,
  chars:  Record<JP name, CharState>,
  layers: Record<key, DynLayer>,   // __event__ + named newlay layers
  …
}
```

Commits go through `commitStage()`, which is also where char enter/exit
crossfade snapshots ("leaving" chars) are created unless inside a buffered
`begintrans/endtrans` block (in which case the whole stage crossfades as one
overlay and per-char snapshots are unnecessary).

## Metadata singleton

`metadata.ts` loads `/meta/file_map.json`, `envinit.json`, `characters.json`
once, then provides:

- `classifyToken(charName, token)` — maps argv words via envinit positions
  (`XPOSITION`/`LEVEL`/`DISPPOSITION`), sprite manifests (pose/dress/diff/
  face), transitions and flag words. Disposition rules:
  [Characters & sprites](../engine/characters.md).
- `renderCharacter(name, spec)` — resolved body/face PNG part list and the
  message-window `顔領域` face rect.
- `mediaUrl(stem)`, `scenarioPath(storage)`, `stageStem(name, time)`.

The metadata module is pure and unit-tested (`metadata.test.ts`); engine
state transitions such as the character disposition state machine
(`resolveCharDisp`, `allcharHideDisp`) live there too so they can be tested
without React.
