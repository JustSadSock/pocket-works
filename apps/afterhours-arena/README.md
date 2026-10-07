# AFTERHOURS ARENA

A 16-bit dockside fighting game inside an independent arcade cabinet. Two original starter fighters, ROOK and VESPER, face off against a deterministic CPU in a first-to-two-wins match. Each round lasts 60 seconds; ties award no point.

## Play

- A / D or left / right arrows: move.
- Space / up arrow: jump; jump over ground projectiles.
- J: short, fast punch. K: slower, longer kick.
- S / down arrow: hold block. Normal attacks deal no chip; specials deal 3 chip damage.
- L: special projectile, spending 60 energy. Land hits or block attacks to build energy.
- P / Escape: pause. F: fullscreen where the browser supports it.
- Touch controls support held movement, blocking, repeated attacks and multiple simultaneous pointers.

ROOK moves more deliberately and fires a slower amber wave. VESPER has faster footwork and a quicker jade projectile. Attacks have startup, active and recovery intervals, hit-stun and knockback. Consecutive hits show a combo count. Impact feedback combines a brief freeze, pixel sparks, optional camera movement and synthesized sound variations.

Selection, sound preference and completed-match results persist locally; a refresh starts at fighter selection. The game pauses when hidden or unfocused. The PWA caches its own build for offline replay. All art and sound are authored locally, with no CDN, remote assets or paid generation dependencies.

## Replacement-ready cast

- `source/core.ts`: fighter IDs/stats, moves, input, AI, projectiles and match state, independent of Phaser or art.
- `source/art.ts`: palette, original pixel scene and 13 authored poses per fighter. Every pose shares a 96×96 frame and a foot anchor at (48, 90).
- `source/main.ts`: Phaser scene, replaceable texture lookup, responsive DOM menus/HUD, input and profile persistence.
- `source/audio.ts`: optional synthesized feedback.

Family photographs and generated sprite sheets can replace the texture/portrait layer while retaining combat rules and frame anchors. Do not crop each animation frame to a different origin.

## Build and verification

From the repository root:

```sh
npm run typecheck --workspace=@pocket-works/afterhours-arena
npm run test --workspace=@pocket-works/afterhours-arena
npm run build --workspace=@pocket-works/afterhours-arena
npm run registry:check
```

Serve the repository or production-like site on localhost, then run:

```sh
ARENA_URL=http://127.0.0.1:4173/apps/afterhours-arena/ ARENA_QA_OUTPUT=/path/to/artifacts node apps/afterhours-arena/qa/gameplay.mjs
```

The QA script uses Chromium desktop, Chromium mobile in both orientations, and WebKit mobile in both orientations. It exercises selection, help, pointer controls, keyboard movement/jump/block/special, pause/resume, a complete CPU match, next round, rematch, return to selection and persistence. Chromium additionally verifies service-worker-backed reload with network access disabled. Windows WebKit fails navigation under both its offline toggle and blocked origin routes before consulting the worker; its report explicitly records that limitation and verifies that HTML, JavaScript and CSS are cached. Screenshots and a machine-readable report go to the selected artifact directory.

`window.render_game_to_text`, `window.__AI_TEST_STATE__` and `window.advanceTime(ms)` expose gameplay state and deterministic stepping for browser QA. Calling `advanceTime` opts the current page into manual simulation; reload to return to normal real-time play.

Scope: one arena, two starter fighters, CPU matches. Family portraits, additional characters and multiplayer are future additions.
