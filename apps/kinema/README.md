# KINEMA

KINEMA is a focused third-person character motion study for Pocket Works. The environment is intentionally almost empty so the authored human model, gait transitions, cloth silhouette, contact shadows and camera motion remain the center of the experience.

## Primary interaction

- Landscape phone first.
- Left analog joystick controls travel direction and continuously maps input magnitude from slow walk to full run.
- Very short joystick gestures are buffered for one simulation frame so quick mobile input is not lost between WebGL frames.
- Drag anywhere on the right side to orbit the third-person camera.
- The default camera sits behind the character; the Blender visual root is explicitly aligned to the runtime forward axis.
- Desktop QA fallback: WASD moves; arrow keys orbit the camera.
- Procedural Web Audio footsteps vary pitch, filtering and impact strength with gait speed. Sound preference persists locally.

## 3D production

`asset-forge/character.py` contains the stable procedural Blender authoring, armature and action/export foundation. `asset-forge/character_blender52.py` applies the final human proportion/rest-pose pass for Blender 5.2, and `asset-forge/character_blender52_v16.py` adds the final asymmetric weight-shifting Idle before export.

The current v1.6 character includes:

- a metric ~1.82 m clothed human silhouette with close-hanging relaxed arms and shaped knees/calves;
- continuous weighted torso, sleeves and trouser legs instead of visibly disconnected limb pieces;
- weighted elbow/knee transitions on one real armature;
- human-scale hands and compact footwear with restrained facial and hair geometry;
- layered field jacket, shirt, belt, cargo trousers, boots/laces, watch, face and hair details;
- embedded fabric, skin, twill, hair and leather variation with PBR material response;
- a naturalized Idle with subtle pelvis/chest counter-rotation, unequal elbow bend, weight transfer and restrained head motion;
- named Blender actions: `Idle`, `Walk`, `Jog`, `Run`, `WalkBack`, `StrafeLeft`, `StrafeRight`, `PivotLeft`, `PivotRight`.

The Asset Forge manifest requires both armature and animation on re-import. Generated output is `public/models/kinema-character.glb`.

Babylon.js owns runtime concerns: safe Blender action-name resolution, phase-synchronized animation blending, analog speed, character heading inertia, acceleration lean, camera lag/FOV, lighting, PBR response and real-time shadows. WebKit/Safari also receives a no-UV material fallback for affected skinned meshes plus a two-frame scene warmup before the loading screen is removed.

## Validation

```bash
npm run test --workspace @pocket-works/kinema
npm run typecheck --workspace @pocket-works/kinema
npm run build --workspace @pocket-works/kinema
```

The release mobile QA exercises the production-like build in Chromium and WebKit, records KINEMA telemetry (`peakSpeed`, `peakGait`, `travelDistance`, animation/material readiness) and captures landscape screenshots for visual inspection before merge.
