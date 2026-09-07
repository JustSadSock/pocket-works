# SIROCCO

SIROCCO is a Babylon.js Enhanced Pocket Works application focused on one loop: walking through a physically legible, effectively endless sand desert on a landscape phone.

## Product constraints

- Landscape-first mobile input: floating left joystick + simultaneous right-side look.
- No missions, enemies, inventory or decorative HUD. The environment, body contact and locomotion are the product.
- No external runtime assets. Sand textures, normal detail, atmosphere, audio and particle sprites are generated locally.
- Offline-first through the app-owned injectManifest service worker.

## Architecture

- `terrain.js` — deterministic directional dune field and terrain sampling.
- `world.js` — streamed near chunks, pooling, far LOD and coarse persistent terrain deformation.
- `sand-physics.js` — sparse world-space physical sand heightfield; footprint depression, displaced rims, downhill transfer, relaxation and persistence budgets.
- `sand-surface.js` — one high-resolution local physical sand mesh around the player so centimetre-scale deformation stays visible without tessellating the whole desert.
- `sand-material.js` — procedural PBR sand with restrained wind ripples and micro-grain normals.
- `movement.js` — acceleration, braking, slope cost, downhill assist and local origin rebasing.
- `character.js` — Bedouin-style first-person body, procedural gait, foot planting and constrained two-link leg IK.
- `particles.js` — event-driven low/heavy sand kicks used only as a transient supplement to geometric deformation.
- `lighting.js` — low-angle directional sun plus stable filtered body shadow; terrain stays out of realtime self-shadow maps to avoid Safari shimmer/acne.
- `atmosphere.js` — shader sky, sun halo, aerial perspective and distance haze.
- `camera.js` — stabilized head camera with restrained bob/sway.
- `input.js` — multitouch landscape controls with keyboard fallback.
- `quality.js` — High / Medium / Low presets with automatic FPS adaptation.
- `debug.js` — developer-only diagnostics (`?debug=1`).
- `audio.js` — procedural wind and sand-step synthesis.

## Physical sand

Foot impacts are stored in world coordinates, not as camera-facing decals. Each step depresses a footprint-shaped region, deposits some of that material around the rim and preferentially transfers sand downhill on steeper slopes. A local relaxation pass softens impossible edges. The sparse heightfield is retained around the player and feeds both the rendered local sand surface and foot/movement sampling, so looking away does not erase tracks.

The high-resolution sand surface is intentionally local. The infinite desert remains streamed at mobile-friendly terrain density while a single small mesh around the player resolves the sub-metre deformation that would otherwise be impossible on 42 m chunks.

## Debug mode

Open `./?debug=1` to expose FPS/frame-time, draw calls, triangles, active chunks, active physical-sand cells, impact count, particle budget, shadow size and quality preset. Toggles expose wireframe, chunk boundaries, IK targets, physical-sand reset, normals, LOD indication and the ground-contact ray.

## Quality profiles

High uses the longest chunk radius, full local sand radius/detail, 1024 px filtered body shadow and the largest persistent deformation budget. Medium reduces local sand radius/detail and memory first. Low further reduces internal render resolution, chunk tessellation, physical-sand retention and transient particles while preserving real foot contact.

## Validation

`npm test --workspace @pocket-works/sirocco` checks deterministic terrain, streamed seam continuity, Babylon top-face winding, and physical-sand invariants including depression, displaced positive material, dirty-region propagation and camera-independent persistence. `npm run build --workspace @pocket-works/sirocco` runs those tests, builds the Vite/PWA bundle and promotes it through the standard Enhanced Pocket Works pipeline.
