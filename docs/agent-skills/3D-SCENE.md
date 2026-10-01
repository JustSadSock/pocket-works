# Skill: 3D Scene Art Direction

Use for Babylon/WebGL/Godot scenes, 3D worlds, characters, environments, lighting and camera presentation. This complements the repository's Asset Forge rules.

## 1. Compose before detailing

Resolve:
- camera height/FOV;
- horizon placement;
- focal subject;
- major value masses;
- silhouette separation;
- navigable negative space;
- foreground/midground/background.

Do not try to rescue weak composition with more props.

## 2. Light for readability and mood

Define a lighting thesis:
- key direction;
- fill level;
- environment/sky contribution;
- shadow softness;
- time/weather;
- accent/emissive rules.

Avoid three arbitrary point lights around every object. Important forms need predictable light logic.

## 3. Material response matters more than texture count

For each material family define:
- roughness;
- metallic/specular behavior;
- normal intensity;
- color variation;
- wear pattern;
- edge response.

One coherent material system usually looks better than many mismatched texture sources.

## 4. Use authored geometry for important objects

Do not build visually important creatures, weapons, architecture or vehicles from runtime primitives purely for convenience.

Use:
- deterministic Blender generation;
- authored GLB;
- CC0/compatible assets with provenance;
- procedural runtime geometry only where appropriate.

Preserve consistent scale, pivots and texel/material density.

## 5. Environment dressing needs hierarchy

Place:
- landmark/focal props;
- navigation guides;
- mid-scale clusters;
- small scatter;
- decals;
- atmospheric detail.

Scatter must follow ecological/architectural logic. Uniform random distribution looks synthetic.

## 6. Animation needs weight

For characters/creatures:
- root motion or movement speed must match stride;
- idle needs breathing/weight shift rather than noise;
- turns need body lead/lag;
- takeoff/landing need anticipation and compression;
- attack contact timing must align with gameplay;
- blend states cleanly.

Use runtime IK/look/aim/springs only after authored base motion is believable.

## 7. Camera is part of animation

Tune:
- follow stiffness;
- look-ahead;
- collision;
- vertical lag;
- FOV response;
- shake budget;
- framing during interactions.

Camera motion should reveal intent, not merely chase coordinates.

## 8. Atmosphere should preserve contrast

Fog, bloom, color grading, volumetrics and particles are supporting layers. Apply them after scene readability works without them.

Do not use bloom to hide flat materials or fog to hide empty environments.

## 9. Stylization must be systemic

If stylized:
- choose consistent proportions;
- simplify forms at the same frequency;
- apply a shared edge/outline rule;
- keep color/material compression consistent;
- align animation exaggeration with the model style.

Do not mix realistic PBR props with flat toy-like hero assets unless the contrast is intentional.

## 10. Mobile performance budget

Measure before reducing quality.

Prefer:
- sensible mesh counts;
- LOD/impostors where valuable;
- baked/static lighting when appropriate;
- texture atlases;
- instancing;
- culling;
- bounded particles;
- restrained post-processing.

Keep the focal subject high quality and reduce invisible/background cost first.

## Done condition

A representative screenshot reads clearly at phone size, the focal subject has believable volume and silhouette, the environment feels intentionally placed rather than scattered, and motion/camera support the fantasy.
