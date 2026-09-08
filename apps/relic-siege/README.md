# RELIC SIEGE

A landscape-first mobile 3D action game for Pocket Works, rebuilt in 2.0 around traversal through an authored mountain fortress rather than a single arena.

## Premise

The last Keeper enters a storm-battered ash citadel, fights through successive fortress spaces and confronts the Ash Warden. The level is designed as a readable physical journey: outer gate, ramp, courtyard encounters and deeper fortress spaces, with authored collision surfaces matching the visible architecture.

## Controls

- left virtual stick: movement;
- drag the right half: orbit/look camera;
- `RELIC`: melee strike / contextual interaction;
- desktop QA fallback: WASD/arrow keys and Space.

## Production pipeline

- Babylon.js renders the scene and owns gameplay, collision, enemy logic and mobile input;
- `asset-forge/world.py` generates the authored fortress through Blender Asset Forge;
- `asset-forge/actors.py` generates the skinned Keeper, Ash Raider and Ash Warden GLBs with armatures and exported actions;
- `audio-forge/manifest.json` generates ambience, combat, footsteps, parries and music through Audio Asset Forge;
- the runtime exposes `window.__AI_TEST_STATE__` so the shared Playwright mobile QA can inspect phase, zone, player position, grounded state, ground distance, health, relic charge, enemy grounding and authored-asset load status.

Walkable Blender ramps use top-surface-only `COL_*` meshes rather than closed collision solids. Each ramp exports as two triangles with no vertical leading, trailing or side faces, so Babylon's capsule solver sees one continuous walkable slope instead of an invisible step at a landing. The gate-to-courtyard collision landing is shortened behind the ramp overlap while the visible authored floor keeps its original footprint.

## Release QA

The RELIC SIEGE Playwright path is intentionally stricter than the generic Pocket Works smoke pass. On both landscape Chromium and WebKit it must load all authored Blender assets, start through the real UI, establish a valid ground collision at the gate, move through the physical virtual joystick into the courtyard, spawn the first encounter, keep the player and active enemies grounded, and connect a real attack through the on-screen combat control. Screenshots and bridge-state diagnostics are retained as workflow artifacts for visual inspection.

Changed-app selection in AI Mobile Gameplay QA is resolved through the GitHub API rather than the runner's local Git worktree. This keeps targeted app selection reliable inside the Playwright job container and prevents unrelated recent apps from turning a RELIC SIEGE validation run into a broad sample pass.

The runtime still contains a lightweight geometry fallback underneath the authored Blender layer so a temporary asset delivery failure is diagnosable rather than producing a blank canvas; release QA nevertheless requires the authored 2.0 assets to load successfully.

The current release gate is expected to run against the regenerated Blender world after the explicit Blender Z-up alignment pass; a bot-generated asset commit alone is not accepted as release evidence until a normal PR-triggered Chromium/WebKit run validates the exact resulting branch state.
