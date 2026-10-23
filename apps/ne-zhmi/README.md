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
The release deliberately implements **the local two-button stage only**. No PocketNet, procedural routes, additional abilities, or deceptive network controls are included. Online rooms belong to the following milestone.

## Architecture
engine.js is pure deterministic fixed-timestep simulation; renderer.js is a Canvas 2D presentation; app.js owns inputs/state/audio and uses the shared mobile runtime. Screen dimensions are handled in CSS; the camera pans on phone while preserving a world-coordinate progress bar. Rendering is uncoupled from physics.

## Tests
Run: node --test apps/ne-zhmi/engine.test.mjs
Validate: npm run registry:check
Mobile visual smoke: apps/ne-zhmi/qa.plan.json
Physics checks cover motor, jump, reversal cooldown, platform collisions, checkpoint, respawn, finish and determinism.

## Diagnostics
The built-in Pocket Works Workshop can be opened from the first or pause screen, and from the standard shortcut. It reports the current application's runtime, errors and owned storage only. Reset prompts for a second click and returns to the menu.
