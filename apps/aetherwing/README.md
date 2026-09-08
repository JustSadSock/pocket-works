# AETHERWING

AETHERWING is an Enhanced Pocket Works Babylon.js flight game for landscape iPhone/Safari. Its core product is the physical sensation of piloting a large living dragon rather than moving a camera with a dragon mesh attached.

## Core loop

Accelerate with wingbeats, convert speed into lift, climb, spread the wings into a glide, bank through a valley, fold into a dive, skim a river or treeline, then load the wings hard and pull back into the sky.

## Flight model

The runtime integrates mass, gravity, aerodynamic drag, lift, bank-induced turning, asymmetric pitch authority, dive acceleration, speed-dependent manoeuvrability and braking drag. Dragon presentation is coupled to those values: animation blending, procedural wing incidence, tail lag, neck compensation, body recoil, camera lag and audio all consume the same flight state.

## Blender production

`asset-forge/dragon.py` deterministically creates the authored dragon mesh, PBR materials, armature, skinning and named animation actions. The generated GLB is validated by the repository Blender Asset Forge with armature and animation requirements enabled. `asset-forge/biome_props.py` produces authored tree/rock prop geometry for world instancing.

## World

The world is streamed in disposable terrain chunks. Multi-scale elevation, ridges, moisture and temperature choose blended biomes; meandering river fields carve visible valleys and water ribbons, while deterministic basins form lakes. Trees, rocks and meadow flowers are scattered according to altitude and moisture, and procedural birds plus ground herds make the landscape feel inhabited. Distant terrain is cheaper than near terrain and old chunks are disposed instead of accumulating forever.

## Mobile controls

- left half: analog flight control — bank/turn horizontally and climb/dive vertically;
- right-half drag: independent orbit look around the dragon;
- double-tap left: short power stroke / acceleration impulse;
- quick tap right: short air-brake pulse; a second tap extends the brake window;
- desktop development fallback: WASD/arrows + pointer drag, Shift for brake and Space for power.

The UI deliberately stays sparse. Flight state is communicated by the dragon, horizon, wind cues and camera before HUD text.

## Quality strategy

AETHERWING dynamically adjusts hardware scaling, terrain detail radius and vegetation density. Expensive work is spread over frames, streamed chunks are disposed behind the player, and the render loop pauses when the page is hidden.
