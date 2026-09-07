# SIROCCO

SIROCCO is a Babylon.js Enhanced Pocket Works application focused on one loop: walking through a physically legible, effectively endless sand desert on a landscape phone.

## Product constraints

- Landscape-first mobile input: floating left joystick + simultaneous right-side look.
- No missions, enemies, inventory or decorative HUD. The environment, body contact and locomotion are the product.
- No external runtime assets. Sand textures, normal detail, atmosphere, audio and particle sprites are generated locally.
- Offline-first through the app-owned injectManifest service worker.

## Architecture

- `terrain.js` — deterministic directional dune field and terrain sampling.
- `world.js` — near chunk streaming, pooling, seamless global sampling and one low-cost far terrain sheet.
- `sand-material.js` — procedural PBR sand albedo, macro normal and detail normal.
- `movement.js` — acceleration, braking, slope cost, downhill assist and local origin rebasing.
- `character.js` — humanoid Babylon `Skeleton`, body awareness, procedural gait, foot planting and two-link leg IK.
- `deformation.js` — batched geometric footprint field via `SolidParticleSystem`.
- `particles.js` — event-driven heavy sand kicks / local slope spill.
- `lighting.js` — low-angle sun and mobile cascaded shadows.
- `atmosphere.js` — shader sky, sun halo, aerial perspective and distance haze.
- `camera.js` — stabilized head camera with restrained bob/sway.
- `input.js` — multitouch landscape controls with keyboard fallback.
- `quality.js` — High / Medium / Low presets with automatic FPS adaptation.
- `debug.js` — developer-only diagnostics (`?debug=1`).
- `audio.js` — procedural wind and sand-step synthesis.

## Debug mode

Open `./?debug=1` to expose FPS/frame-time, draw calls, triangles, active chunks, footprint count, particle budget, shadow size and quality preset. Toggles expose wireframe, chunk boundaries, IK targets, footprint geometry, normals, LOD indication and the ground-contact ray.

## Quality profiles

High uses a 7×7 near chunk field at 30 segments, 1536px cascaded shadows, longer horizon and the full particle/footprint budgets. Medium starts by default on high-DPR touch devices. Low reduces internal render resolution, chunk tessellation, shadow map size and transient sand effects before sacrificing locomotion or foot contact.

## Validation

`npm test --workspace @pocket-works/sirocco` runs deterministic terrain, seam continuity and normal/slope invariants. `npm run build --workspace @pocket-works/sirocco` runs those tests, builds the Vite/PWA bundle and promotes it through the standard Enhanced Pocket Works pipeline.
