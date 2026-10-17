# Туман завоеваний · Fog of Conquest

Standalone Pocket Works adaptation of [JustSadSock/Fog-Of-Conquest](https://github.com/JustSadSock/Fog-Of-Conquest).

## Features
- Seeded symmetric topographic maps: 12×16, 16×22, 20×28, with stable land crossings.
- True hidden fog plus explored memory, LOS limited by peaks.
- Six field formations (swordsmen, archers, heavies, cavalry, healers, scouts).
- Six military/economic buildings (citadel, mill, barracks, stable, healer tower, fort).
- Recruitment, mill upgrades, unit health, terrain cover, flank support, capture and citadel sieges.
- Six AI difficulties; deterministic rule engine, autosave and recovery after reload.
- PocketNet server-authoritative two-player turn-based combat with private views and resumable seats.
- Touch pan, pinch-to-zoom, wheel and keyboard navigation; desktop status mini-map.
- An offline first PWA, separate namespace, icon and cache.

## Controls
Tap one of your own banner tokens, then a legal position or enemy. Tap your building to recruit: choose unit and an adjacent free tile. Capture neutral structures by moving onto them, and defeat the enemy by destroying the citadel. Click End turn to transfer control. With a healer selected, tap a wounded ally to heal. Zoom using +/- or pinch; drag to pan. You may safely return after each completed command; autosave stores solo matches.

## Multiplayer
A PocketNet room is server-authoritative and persists while disconnected. The owner starts when both participants join. Turn ownership, recruitment economy, combat and fog are validated by the server. Each projection hides unexplored terrain, enemy units and unobserved buildings. Client revisions prevent stale commands.

Backend activation requires the immutable PocketNet module snapshot and lockfile **in a separate platform change**. The app PR must stay inside apps/fog-of-conquest/.

## Rules & verification
Run: node --test apps/fog-of-conquest/test/engine.test.mjs. Verify new game, end turn, reload, AI progression and two clients joining PocketNet. Production deployment relies on Cloudflare Workers Builds after merge.
