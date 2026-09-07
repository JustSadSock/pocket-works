# FIRN

FIRN is an Enhanced Pocket Works Babylon.js first-person mountain-snow experience designed primarily for landscape iPhone/Safari.

## Core loop

Walk. Read the slope. Feel the snow change underfoot. Deep powder slows and swallows steps, wind crust carries weight, ice releases traction, steep loaded slopes shed small sheets of snow, and every step leaves persistent tracks.

## Architecture

- `terrain.js` — deterministic mountain macro-forms, ridges, saddles and wind exposure.
- `snow.js` — snowpack classification, depth, hardness, traction, instability and visual tone.
- `world.js` — streamed near chunks, pooled geometry, far landscape and sparse rock exposure.
- `snow-material.js` — procedural PBR snow/ice textures generated offline at runtime.
- `movement.js` — slope-aware locomotion, deep-snow drag, inertia and downhill sliding.
- `deformation.js` — high-detail local snow deformation, persistent footprints and slide scars.
- `particles.js` — wind-blown powder, footstep puffs and local mini-sloughs.
- `weather.js` / `lighting.js` — cold daylight, fog, visibility and wind variation.
- `quality.js` — adaptive render scale, geometry radius and effect budgets.
- `input.js` — Pocket Works shared pointer runtime based mobile controls.
- `audio.js` — gesture-unlocked procedural wind and snow crunch.

## Product constraints

No combat, inventory, NPCs or progression systems. The environment and movement are the product.
