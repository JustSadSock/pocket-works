# AETHERWING

AETHERWING is an Enhanced Pocket Works Babylon.js flight game for landscape iPhone/Safari. Its core product is the physical sensation of piloting a large living dragon rather than moving a camera with a dragon mesh attached.

## Core loop

Accelerate with wingbeats, convert speed into lift, climb, spread the wings into a glide, bank through a valley, fold into a dive, skim a river or treeline, then load the wings hard and pull back into the sky.

## Flight model

The runtime integrates mass, gravity, aerodynamic drag, lift, bank-induced turning, asymmetric pitch authority, dive acceleration, speed-dependent manoeuvrability and braking drag. Dragon presentation is coupled to those values: animation blending, procedural wing incidence, tail lag, neck compensation, body recoil, camera lag and audio all consume the same flight state.

## Blender production

`asset-forge/dragon.py` deterministically creates the authored dragon mesh, PBR materials, armature, skinning and named animation actions. The current production source uses a lean overlapping torso, a longer articulated neck and tail, scalloped multi-rib wing membranes, tucked four-limb anatomy, head horns, cheek spines, a denser dorsal ridge and a staggered irregular scale texture without long periodic bands. The generated GLB is rebuilt and re-import validated by the repository Blender Asset Forge with armature and animation requirements enabled. `asset-forge/biome_props.py` produces authored tree/rock prop geometry for world instancing.

## World

The world is streamed in disposable terrain chunks. Multi-scale elevation, ridges, moisture and temperature choose blended biomes; a broad valley plus submerged channel carves the river, while deterministic basins form lakes. River meshes use an independent x-column streamer rather than waiting for terrain z-chunks, so the visible waterway is present continuously from the opening frame and remains independent of terrain disposal. Forests combine fir, aspen and broadleaf silhouettes with riparian selection, age variation, clearings and understory. Procedural birds and ground herds make the landscape feel inhabited. Distant terrain is cheaper than near terrain and old chunks are disposed instead of accumulating forever.

## Mobile controls

- left half: analog flight control — bank/turn horizontally and climb/dive vertically;
- right-half drag: independent orbit look around the dragon;
- double-tap left: short power stroke / acceleration impulse;
- quick tap right: short air-brake pulse; a second tap extends the brake window;
- desktop development fallback: WASD/arrows + pointer drag, Shift for brake and Space for power.

The UI deliberately stays sparse. Flight state is communicated by the dragon, horizon, wind cues and camera before HUD text.

## Quality strategy

AETHERWING dynamically adjusts hardware scaling, terrain detail radius and vegetation density. Expensive terrain work is spread over frames while the lightweight river strip is guaranteed immediately around the player. Streamed geometry is disposed behind the player without destroying shared terrain/water materials, and the render loop pauses when the page is hidden. The mobile QA journey crosses chunk boundaries and explicitly checks that shared materials, terrain and river streaming survive the transition in Chromium and WebKit.
