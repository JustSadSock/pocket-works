# SIROCCO

SIROCCO is a Babylon.js Enhanced Pocket Works application focused on one loop: walking through a physically legible, effectively endless sand desert on a landscape phone.

## Product constraints

- Landscape-first mobile input: floating left joystick + simultaneous right-side look.
- No missions, enemies, inventory or decorative HUD. The environment, body contact and locomotion are the product.
- Sand textures, normal detail, atmosphere, audio and particle sprites are generated locally. The CC0 humanoid is fetched at build time and bundled into the app, so runtime/offline play does not depend on a third-party host.
- Offline-first through the app-owned injectManifest service worker.

## Architecture

- `terrain.js` — deterministic directional dune field and terrain sampling.
- `world.js` — streamed near chunks, pooling, far LOD and the local high-detail replacement aperture.
- `sand-physics.js` — sparse world-space physical sand heightfield; footprint depression, displaced rims, downhill transfer, relaxation and persistence budgets.
- `sand-surface.js` — high-resolution local physical sand mesh around the player; centimetre-scale deformation without tessellating the whole desert.
- `sand-material.js` — procedural PBR sand with restrained wind ripples and micro-grain normals.
- `wind.js` — deterministic coherent wind field shared by sound, airborne sand, haze and erosion.
- `wind-erosion.js` — tightly budgeted directional transport of fresh loose footprint material; calm air leaves tracks intact.
- `presence.js` — isolated Babylon pre-render presence layer that coordinates wind, gust haze, cloth response, audio and erosion without entering the core locomotion loop.
- `movement.js` — acceleration, braking, slope cost, downhill assist and local origin rebasing.
- `character.js` — imported CC0 Quaternius skinned humanoid, real walk/idle animation blending, animated foot contact and a SIROCCO-specific Bedouin clothing layer.
- `scripts/fetch-character-asset.mjs` — reproducibly fetches the pinned-size CC0 GLB before build.
- `particles.js` — event-driven heavy foot kicks plus a separate low ground-hugging wind drift system.
- `lighting.js` — low-angle directional sun plus stable contact grounding; terrain stays out of realtime self-shadow maps to avoid Safari shimmer/acne.
- `atmosphere.js` — shader sky, sun halo, aerial perspective and distance haze.
- `camera.js` — stabilized first-person camera with selective garment culling for safe downward views.
- `input.js` — multitouch landscape controls with keyboard fallback.
- `quality.js` — High / Medium / Low presets with automatic FPS adaptation.
- `debug.js` — developer-only diagnostics (`?debug=1`).
- `audio.js` — procedural wind, gust and sand-step synthesis driven by the same coherent wind state as the visuals.

## Character

The base body is the original rigged Quaternius CC0 humanoid distributed as `assets/human.glb` by `UMRAM-Bilkent/supine-human-model`. It includes eight walk/idle animation clips. SIROCCO scales it to a human height, blends idle and forward locomotion against the actual controller speed, derives sand impacts from animated foot bones, adapts the body orientation to the dune grade, and adds a sun-bleached thobe, waist sash, keffiyeh layers and sleeves. See `THIRD_PARTY_ASSETS.md` for source/license details.

## Physical sand

Foot impacts are stored in world coordinates, not as camera-facing decals. Each step depresses a footprint-shaped region, deposits some of that material around the rim and preferentially transfers sand downhill on steeper slopes. A local relaxation pass softens impossible edges. The sparse heightfield is retained around the player and feeds both the rendered local sand surface and foot/movement sampling, so looking away does not erase tracks.

Fresh positive rims carry a loose-state value. During stronger winds a small quality-dependent erosion budget transfers part of that material downwind and very slowly softens old compact cavities. The transport is deliberately orders of magnitude slower than the foot impact, so tracks remain readable and only age when the environment is active.

The local sand mesh has no artificial terrain lift and does not receive a separate shadow map. Its only purpose is to resolve sub-metre deformation while visually merging into the streamed base terrain.

## Wind presence

`DesertWind` is deterministic and continuous. The same `strength` / `gust` state changes the WebAudio filters, emits low streaks of blowing sand, modulates only a narrow band of horizon haze, adds subtle secondary motion to loose Bedouin accessories, and drives the sparse erosion pass. This coherence is intentional: a gust should be heard, seen and felt as one event rather than several unrelated random effects.

## Debug mode

Open `./?debug=1` to expose FPS/frame-time, draw calls, triangles, active chunks, active physical-sand cells, impact count, particle budget, shadow size and quality preset. Toggles expose wireframe, chunk boundaries, animated foot targets, physical-sand reset, normals, LOD indication and the ground-contact ray.

## Quality profiles

High uses the longest chunk radius, full local sand detail and the largest persistent deformation/erosion budgets. Medium reduces local sand radius/detail and memory first. Low further reduces internal render resolution, chunk tessellation, physical-sand retention and transient particles while preserving real foot contact and coherent gust timing.

## Validation

`npm test --workspace @pocket-works/sirocco` checks deterministic terrain, streamed seam continuity, Babylon top-face winding, physical-sand invariants, coherent wind normalization and directional erosion. Production-like Playwright QA runs SIROCCO in Chromium and WebKit landscape, exercises real walking/footprints/Blender landmarks/camera safety, and has a dedicated gust test for wind-driven sand and track ageing. `npm run build --workspace @pocket-works/sirocco` first fetches the pinned CC0 character asset, runs the Node regression suites, builds the Vite/PWA bundle and promotes it through the standard Enhanced Pocket Works pipeline.
