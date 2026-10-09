# CANTICA II · Песнь света

A portrait offline-first Gothic stained-glass puzzle inside Pocket Works. Every action changes physical-looking leaded glass and its internal light circuit.

## Gameplay
Rotate panes by tapping. A channel carries light only when it meets a reciprocal channel in the adjacent pane. Reach every reliquary at the bottom.

- 500 deterministic, seeded, offline-generated levels in ten books of 50.
- Grid sizes: 4×4 (levels 1–25), 5×5 (26–135), 6×6 (136–305), 7×7 (306–500).
- Reliquary targets increase from one to four, alongside path length and decoy complexity.
- Every puzzle is generated from a spanning tree with an actual solution; scrambling ensures it starts incomplete.
- 'Главы' opens ten books and 50 numbered windows in each; locked windows are not selectable.
- 'Подсказать путь' highlights a pane and the number of rotations needed; 'Заново' confirms before reshuffling.
- Drag the sun medallion left/right to shift refracted highlights and projected caustics (visual only).
- Keyboard controls: arrow keys select a pane; Enter/Space rotates it. Escape dismisses dialogs.
- Sound defaults to muted and can be switched on by a user gesture.
- From every important screen the player can return directly to Pocket Works.

## Save state and migration
The current save namespace is pocket-works:cantica-glass:save-v2. The previous save-v1 is read if v2 is absent: previously unlocked windows and sound preference are kept, but puzzle rotations and best attempts are reset because the generated routes differ.

## Rendering
Canvas 2D combines beveled leadwork, stained polygons, lens-like thickness, tiny trapped bubbles, carved glass ornament, screen-blended light channels and chromatic caustics. DOM navigation and controls are framed as a medieval stone instrument, not a generic web dashboard. Works offline without external fonts or asset downloads.

## Verification
From the repository root:
- node --test apps/cantica-glass/tests/logic.test.mjs
- node --check apps/cantica-glass/app.js
- npm run registry:check
- node scripts/validate-visual-direction.mjs --app=cantica-glass
- npm run deploy:site

The tests cover 500 levels × four scrambles, uniqueness, hint-driven completion, save restoration and difficulty tiers. Browser QA should additionally check layout and finger gestures on iPhone-sized viewports.

Release 2.0.0 · 2026-10-09.
