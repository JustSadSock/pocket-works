# NOT DEAD YET — Pocket Works

A complete offline-first first-person WebGL 3D survival horror inspired by JustSadSock/Not-Dead-Yet (HTML5) and JustSadSock/Not_dead_yet (Godot).

## Core gameplay

Navigate a changing corridor maze, collect three fixed memory signals and return to the original cyan station. Real pursuers track the player. 70% of silhouettes are five-second illusions. The flashlight dispels false silhouettes and can stun real ones. Sprint to escape, collect all three signals, then return alive.

## Repairs to the original

- The old fov.js depended on gameMap.cols/rows/tiles while map.js exposed a sparse chunk map, and monsters.js expected yet another representation. Current enemy AI, 3D collision, and occlusion share one World API.
- The old procedural generator silently abandoned long connections and later trimmed corridor tiles, causing isolated rooms. Every new sector has four mandatory aligned two-cell gates, all linked to a central spine; side rooms explicitly connect to it.
- The original regenerated forgotten tiles one by one and overlaid old fragments, potentially trapping the player. This implementation regenerates whole distant sectors only while at least two sector steps away and unseen for 13 seconds. Its four gateways never change.
- Looking direction is independent of walking direction, unlike the previous 2D player movement angle.
- There is now a complete objective, victory, death, autosave, restart confirmation, sound toggle, desktop controls and mobile twin-thumb controls.

## Controls

Desktop: WASD / arrows, mouse, Shift sprint, F torch, M sound, Esc pause. Mobile: left stick walks, right side turns the view, hold БЕГ to sprint, tap СВЕТ to toggle the torch.

The compass shows direction and distance to the closest missing memory beacon and then the exit. Progress is saved on pause, page exit and periodically. No remote runtime dependencies.

## Test

Run node --test apps/not-dead-yet/tests/maze.test.mjs.

Browser QA: start by clicking #start; inspect window.__PW_TEST_STATE__ for renderer3D and current position. Walk forward, toggle torch, pause/resume, save/reload, and inspect phone and PC screenshots.

The renderer uses custom native WebGL geometry and light/fog shaders. Requires a WebGL-enabled browser.
