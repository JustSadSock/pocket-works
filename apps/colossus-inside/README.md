# COLOSSUS // INSIDE

A landscape-first Pocket Works Babylon.js vertical slice built around one unusual platform: the animated body of a city-sized biomechanical colossus.

The player wakes on the back, crosses storm-battered armor, survives a lightning strike that destabilizes the gait, traverses the shoulder, enters a living mechanical interior, repairs the failed stabilizer and climbs out onto the head for the finale.

## Blender pipeline

`asset-forge/manifest.json` builds three deterministic assets with Pocket Works Asset Forge:

- `colossus.glb` — articulated exterior, armor, cables, fracture pieces and Walk/Strain/Recover motion;
- `interior.glb` — spine chamber, heart, pistons, valves, cables and Pulse/Fail/Recovered animation;
- `player.glb` — rigged traveler with Idle/Walk/Run/Brace/Hang/Climb/Fall actions.

Asset Forge successfully generated and re-import validated all three GLBs on the feature branch. Visually important geometry is Blender-authored; runtime primitives are limited to invisible carriers/collision helpers, atmospheric layers, particles and simple world proxies.

## Gameplay systems

- moving-surface hierarchy with inherited carrier motion and acceleration transfer;
- damage-driven gait instability that changes after the stabilizer repair;
- automatic edge danger / hanging and context climbing rather than a QTE layer;
- secondary motion on cables, suspended pieces, antennae and the player scarf;
- nearby authored armor fracture event triggered by lightning;
- storm rain, fog, distant flashes, atmospheric perspective and adaptive mobile quality;
- procedural Web Audio for colossus steps, structural strain, thunder, wind, heart and repair feedback;
- persistent run state, restart flow, managed Pocket Works updates and offline PWA packaging.

## Controls

Left thumb moves. Right side looks. The single context button braces outside, enters hatches, operates the stabilizer and climbs when hanging.

The app is designed primarily for landscape iPhone / mobile Safari and keeps the interface intentionally minimal.
