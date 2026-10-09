# CANTICA — Песнь света

A standalone portrait Quick PWA for Pocket Works. Six hand-designed medieval stained-glass circuit puzzles. Tap a glass fragment to turn it 90°; linked lead channels carry the sunbeam from the rose window to the reliquaries. Multiple reliquaries require branching channels.

## Controls

- Tap or click a pane to rotate its stained-glass channels clockwise.
- Keyboard: focus canvas, arrow keys to select a pane, Enter/Space to rotate.
- **Главы** selects unlocked levels; **Подсказать путь** shows the next required pane and number of turns; **Заново** asks before reshuffling.
- Toggle synthesized bells on or off; all sound requires a user gesture.
- Every game screen keeps a visible text-labelled **Pocket Works** exit.

## State and offline

Progress, current pane rotations, best attempts and sound preference persist in namespaced localStorage `pocket-works:cantica-glass:save-v1`.
The dedicated service worker precaches the game and Pocket Works mobile/update/workshop dependencies; it only deletes its own versioned caches.

## Technical

`logic.js` owns authored solutions, deterministic scrambling, mask rotation, reciprocal graph traversal and validation. `app.js` owns input, animations, modal flow and Canvas painting. No remote images, fonts or other network runtime dependencies.

Version 1.0.0 · 2026-10-09

## Validation

In a repository checkout run:

```sh
node --check apps/cantica-glass/logic.js
node --check apps/cantica-glass/app.js
npm run registry:check
node scripts/validate-visual-direction.mjs --app=cantica-glass
npm run health
```
