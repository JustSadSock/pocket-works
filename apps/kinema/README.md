# KINEMA

KINEMA is a focused third-person character motion study for Pocket Works. The environment is intentionally almost empty so the authored human model, gait transitions, cloth silhouette, contact shadows and camera motion remain the center of the experience.

## Primary interaction

- Landscape phone first.
- Left analog joystick controls travel direction and continuously maps input magnitude from slow walk to full run.
- Drag anywhere on the right side to orbit the third-person camera.
- The default camera sits behind the character; the Blender visual root is explicitly aligned to the runtime forward axis.
- Desktop QA fallback: WASD moves; arrow keys orbit the camera.
- Procedural Web Audio footsteps vary pitch, filtering and impact strength with gait speed. Sound preference persists locally.

## 3D production

`asset-forge/character.py` authors the character in Blender rather than assembling the visible body from Babylon runtime primitives. `asset-forge/character_blender52.py` is the Blender 5.2 production entrypoint: it handles the layered-Action compatibility change and applies the final proportion pass before export.

The current v1.2 character includes:

- a metric ~1.82 m clothed human silhouette with relaxed arm placement and more natural proportions;
- continuous weighted torso, sleeves and trouser legs instead of visibly disconnected limb pieces;
- weighted elbow/knee transitions on one real armature;
- slimmer sleeves and legs, human-scale hands/feet and restrained facial features;
- layered field jacket, shirt, belt, cargo trousers, boots/laces, watch, face and hair details;
- embedded fabric, skin, twill, hair and leather albedo variation with PBR material response;
- named Blender actions: `Idle`, `Walk`, `Jog`, `Run`, `WalkBack`, `StrafeLeft`, `StrafeRight`, `PivotLeft`, `PivotRight`.

The Asset Forge manifest requires both armature and animation on re-import. Generated output is `public/models/kinema-character.glb`.

Babylon.js owns runtime concerns: safe Blender action-name resolution, phase-synchronized animation blending, analog speed, character heading inertia, acceleration lean, camera lag/FOV, lighting, PBR response and real-time shadows.

## Validation

```bash
npm run test --workspace @pocket-works/kinema
npm run typecheck --workspace @pocket-works/kinema
npm run build --workspace @pocket-works/kinema
```

After Asset Forge generates the GLB, the standard Pocket Works mobile gameplay QA must exercise the production-like build and its landscape screenshots must be visually inspected before merge.
