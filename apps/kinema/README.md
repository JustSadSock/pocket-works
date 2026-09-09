# KINEMA

KINEMA is a focused third-person character motion study for Pocket Works. The environment is intentionally almost empty so the authored human model, gait transitions, cloth silhouette, contact shadows and camera motion remain the center of the experience.

## Primary interaction

- Landscape phone first.
- Left analog joystick controls travel direction and continuously maps input magnitude from slow walk to full run.
- Movement now uses an inertial world-space velocity vector, so acceleration, braking and reversals carry physical momentum instead of snapping the body to joystick direction.
- Very short joystick gestures are buffered for one simulation frame so quick mobile input is not lost between WebGL frames.
- Drag anywhere on the right side to orbit the third-person camera.
- The default camera sits behind the character, leads slightly in the direction of actual travel and remains independent from the body's short turning delay.
- Desktop QA fallback: WASD moves; arrow keys orbit the camera.
- Procedural Web Audio footsteps vary pitch, filtering and impact strength with gait speed. Sound preference persists locally.

## 3D production

`asset-forge/character.py` contains the stable procedural Blender authoring, armature and action/export foundation. `asset-forge/character_blender52.py` applies the final human proportion/rest-pose pass for Blender 5.2, and `asset-forge/character_blender52_v16.py` adds the asymmetric weight-shifting Idle before export.

The current character includes:

- a metric ~1.82 m clothed human silhouette with close-hanging relaxed arms and shaped knees/calves;
- continuous weighted torso, sleeves and trouser legs instead of visibly disconnected limb pieces;
- weighted elbow/knee transitions on one real armature;
- human-scale hands and compact footwear with restrained facial and hair geometry;
- layered field jacket, shirt, belt, cargo trousers, boots/laces, watch, face and hair details;
- embedded fabric, skin, twill, hair and leather variation with PBR material response;
- a naturalized Idle with subtle pelvis/chest counter-rotation, unequal elbow bend, weight transfer and restrained head motion;
- named Blender actions: `Idle`, `Walk`, `Jog`, `Run`, `WalkBack`, `StrafeLeft`, `StrafeRight`, `PivotLeft`, `PivotRight`.

The Asset Forge manifest requires both armature and animation on re-import. Generated output is `public/models/kinema-character.glb`.

## Runtime motion system

Babylon.js owns runtime motion and rendering concerns. KINEMA 1.7 no longer treats the five directional Blender actions as dormant export data:

- `WalkBack` blends in while physical velocity temporarily trails behind a reversing body;
- `StrafeLeft` / `StrafeRight` blend while the trajectory crosses the body's local side axis;
- `PivotLeft` / `PivotRight` blend during low-speed heading corrections;
- Walk/Jog/Run remain phase-synchronized and regain full weight as speed rises and the body aligns to travel;
- body yaw advances with a bounded turn rate instead of instant quaternion snapping;
- forward/lateral acceleration drive subtle pitch/roll body inertia;
- camera targeting leads actual velocity rather than only following the root position.

WebKit/Safari retains the no-UV material fallback for affected skinned meshes plus a two-frame scene warmup before the loading screen is removed.

## Validation

```bash
npm run test --workspace @pocket-works/kinema
npm run typecheck --workspace @pocket-works/kinema
npm run build --workspace @pocket-works/kinema
```

Pocket Works AI Mobile Gameplay QA must exercise the production-like 1.7 build in Chromium and WebKit before merge. Runtime telemetry exposes peak speed, travel distance, loaded animation counts, directional clip availability and peak directional blend so the mobile pass can detect regressions that a final screenshot alone would hide.
