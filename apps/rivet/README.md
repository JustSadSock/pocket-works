# RIVET

RIVET is a landscape, touch-first 2D action roguelite built for the Pocket Works Godot Web runtime.

## Loop

A run contains six compact industrial combat cells and a final forge boss. Clearing a normal cell opens the workbench. The player replaces one physical subsystem rather than taking abstract percentage upgrades:

- **Weapon:** Riveter, Cutter, Arc Coil or Mortar.
- **Chassis:** Strider, Treads or Skates.
- **Core:** Flywheel, Capacitor or Boiler.

The active modules change weapon behavior, mobility, survivability and the machine silhouette. Runs randomize both encounters and workbench choices.

## Controls

### Touch

- Left pad: move freely across the arena.
- **FIRE:** hold to attack; aim is gently resolved toward the nearest valid threat.
- **RAM:** directional invulnerable dash. Several chassis alter its behavior.
- Pause is always available from the top-right HUD.

### Keyboard

- WASD / arrows: move.
- Z / Space: fire.
- Shift / X: ram dash.
- Escape: pause.

## Product details

- Procedural vector rendering: no remote assets and no CDN dependency.
- Hit-stop, recoil, enemy telegraphs, screen shake, sparks, debris and module-specific silhouettes are authored in GDScript.
- Small procedural PCM sound bank is generated at runtime after the first user gesture; sound can be disabled.
- Local Pocket Works storage preserves clears, best room, best kill count and sound preference.
- PocketWorks.publish_test_state() exposes gameplay state for browser QA.
- Start, pause and result states all provide a text-labelled **POCKET WORKS** exit.
