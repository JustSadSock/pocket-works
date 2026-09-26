# Arena Shift

Arena Shift is a landscape Pocket Works action game built specifically to make the platform's architectural progression visible in play rather than in a benchmark screen.

## Core idea

The combat simulation is singular: player position, health, cooldowns, enemies, wave state, upgrades and boss state are shared. The top-center CLASSIC / FORGE switch changes the presentation while the simulation keeps running.

- Classic is deliberately constrained to the visual grammar that a strong early Pocket Works HTML/JS game could reasonably use: flat vector forms, procedural 2D particles, a fixed top-down view and synthetic-style feedback.
- Forge uses the current Godot Web runtime, a scene graph, 3D camera/light/materials, authored Blender output when present, generated audio assets, particles and animation hooks.

This is not two separate demos. You can switch mid-dash, mid-wave or during the boss fight and continue at the same position with the same state.

## Controls

Touch: left thumb movement stick, ATTACK, DASH, the live renderer switch, and pause.
Keyboard: WASD/arrows, Space to attack, Shift to dash, Tab to switch renderer, Esc to pause.

## Build pipeline

The asset-forge directory generates assets/sentinel.glb through the repository Blender Asset Forge.
The audio-forge directory generates the app-local OGG bank through Audio Asset Forge.
The Godot Web Runtime workflow exports web/ from the authored project and commits deterministic output back to the feature branch.

Generated web output is not hand-edited.


## Web performance

The Web build starts new installs in Classic presentation so the architectural progression is experienced in order and the initial frame stays light on mobile browsers. Forge rendering uses a reduced internal 3D scale and a 30 FPS ceiling while retaining the authored Blender character, lights, particles, camera motion and generated audio. Renderer choice is persisted after the player switches modes.
