# RELIC SIEGE

A short landscape-first mobile 3D action game for Pocket Works.

## Premise

The last keeper of a mountain citadel must reignite three solar obelisks during a night ash storm. Every ignition wakes a larger wave of ash-raiders; after the third wave the ancient Ash Warden enters the arena.

## Controls

- left virtual stick: movement;
- drag the right half: orbit/look camera;
- `RELIC`: radial/cone strike;
- near an inactive obelisk with the arena clear, the same button becomes `IGNITE`;
- desktop QA fallback: WASD/arrow keys and Space.

## Production pipeline

- Babylon.js renders and runs gameplay;
- `asset-forge/` generates the authored fortress and animated Ash Warden through Blender Asset Forge;
- `audio-forge/manifest.json` generates music, wind and combat SFX through Audio Asset Forge;
- the runtime exposes `window.__AI_TEST_STATE__` so the shared Playwright mobile QA can read health, phase, enemy count, pylon progress, position, grounded state, FPS and authored-asset load status.

The game intentionally keeps a runtime geometry fallback under the Blender layer. If a generated GLB is temporarily unavailable, the game remains playable instead of becoming a blank/broken scene.
