# COLOSSUS // INSIDE

A landscape-first Pocket Works Babylon.js vertical slice built around one unusual platform: the animated body of a city-sized biomechanical colossus.

The player wakes on the back, crosses storm-battered armor, survives a lightning strike that destabilizes the gait, traverses the shoulder, enters a living mechanical interior, repairs the failed stabilizer and climbs out onto the head for the finale.

## Blender pipeline

`asset-forge/manifest.json` builds three deterministic assets with Pocket Works Asset Forge:

- `colossus.glb` — full articulated exterior, armor, cables, fracture pieces and Walk/Strain motion;
- `interior.glb` — spine chamber, heart, pistons, valves, cables and Pulse/Fail/Recovered animation;
- `player.glb` — rigged traveler with Idle/Walk/Run/Brace/Hang/Climb/Fall actions.

All collision/attachment proxies remain runtime-only and invisible; visually important geometry is Blender-authored.

## Controls

Left thumb moves. Right side looks. The single context button braces outside, enters hatches, operates the stabilizer and climbs when hanging.
