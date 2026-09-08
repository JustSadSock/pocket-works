# KINEMA

KINEMA is a focused third-person character motion study for Pocket Works. The environment is intentionally almost empty so the authored human model, gait transitions, cloth silhouette, contact shadows and camera motion remain the center of the experience.

## Primary interaction

- Landscape phone first.
- Left analog joystick controls travel direction and continuously maps input magnitude from slow walk to full run.
- Drag anywhere on the right side to orbit the third-person camera.
- Desktop QA fallback: WASD moves; arrow keys orbit the camera.
- Procedural Web Audio footsteps vary pitch, filtering and impact strength with gait speed. Sound preference persists locally.

## 3D production

`asset-forge/character.py` creates the character in Blender rather than assembling the visible body from Babylon runtime primitives. It authors:

- a metric ~1.82 m clothed human silhouette;
- layered jacket, shirt, belt, cargo trousers, boots, watch, face and hair details;
- embedded fabric/skin/leather albedo variation;
- one real armature used by all body/clothing geometry;
- named Blender actions: `Idle`, `Walk`, `Jog`, `Run`, `WalkBack`, `StrafeLeft`, `StrafeRight`, `PivotLeft`, `PivotRight`.

The Asset Forge manifest requires both armature and animation on re-import. Generated output is `public/models/kinema-character.glb`.

Babylon.js owns runtime concerns: animation blending, analog speed, character heading inertia, acceleration lean, camera lag/FOV, lighting, PBR response and real-time shadows.

## Validation

```bash
npm run test --workspace @pocket-works/kinema
npm run typecheck --workspace @pocket-works/kinema
npm run build --workspace @pocket-works/kinema
```

After the Blender Asset Forge action has generated the GLB, run the standard Pocket Works mobile gameplay QA in Chromium and WebKit and inspect the captured landscape screenshots.
