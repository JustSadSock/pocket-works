# НЕ ЖМИ! — Stage 1
First playable stage of the local co-operative robot game in Pocket Works.

## Interaction
- Start the testing course from the instrument panel.
- Operator 1 presses **ПРЫГ** (Space/W/Up Arrow).
- Operator 2 presses **РАЗВОРОТ** (R/Left Arrow/Right Arrow).
- Boltik drives on its own; cooperate to jump raised steps, avoid pits and reach the finish.
- The checkpoint after the central descent becomes the respawn point; falling increments a counter.
- Pause, restart, complete, inspect run stats and replay; best time is stored locally.

## Scope
Version 0.1 implemented the local two-button stage only. Version 0.2 adds PocketNet rooms with server-owned physics and reconnection. Procedural routes and additional abilities belong to later milestones.

## Architecture
engine.js is pure deterministic fixed-timestep simulation; renderer.js is a Canvas 2D presentation; app.js owns inputs/state/audio and uses the shared mobile runtime. Screen dimensions are handled in CSS; the camera pans on phone while preserving a world-coordinate progress bar. Rendering is uncoupled from physics.

## Tests
Run: node --test apps/ne-zhmi/engine.test.mjs
Validate: npm run registry:check
Mobile visual smoke: apps/ne-zhmi/qa.plan.json
Physics checks cover motor, jump, reversal cooldown, platform collisions, checkpoint, respawn, finish and determinism.

## Diagnostics
The built-in Pocket Works Workshop can be opened from the first or pause screen, and from the standard shortcut. It reports the current application's runtime, errors and owned storage only. Reset prompts for a second click and returns to the menu.

## Stage 2 — PocketNet
Select "Создать онлайн-комнату" or "Войти по коду" from the menu. Two players join with eight-digit codes or links. Host can swap roles and start/restart; the first operator can only jump and the second can only reverse. The server calculates all authoritative physics and sends snapshots at approximately 8–10 Hz; clients render smoothly between snapshots. If either operator stops sending heartbeats for 1.25 seconds, the world freezes until both are present again. Room state survives websocket reconnect by session token. Leave confirmation is required. No PocketLAN.

Server module: `server/module.ts`, pinned as `pocketnet/module-versions/ne-zhmi/v1.ts`. Run `node --test apps/ne-zhmi/server.test.mjs` and `npm run pocketnet:check`. The PocketNet release lock accompanies the module to ensure installed room versions remain immutable.

## Stage 3 — Mechanical Course Factory
Every locally started run or new PocketNet round now generates five safe connector modules from a catalog of twelve, using a reproducible seed. The world has three painted workshop themes, dynamic track dimensions, collision-aware timed gates and pistons, conveyors, springs and fan forces. Local replay repeats the same seed; next run generates a new layout. PocketNet locks the course in the authoritative room snapshot (server module v3), so all connected clients see the same geometry and devices.
