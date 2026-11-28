# Universal Character Forge — Research & Technology Foundation (v0.1)
Status: research, no production approval. Independent branch from main; no imports from Banners experimental branch. Character Forge generates research inputs; Universal Art Forge v2 owns production transactions, dependency graph, hash/index freshness and publication. No app registration, runtime engine or QA contract changed.
## Evidence and historical review
Banners e5bb69b research/orthographic-art/meshes.js: reusable ellipsoids, rods, explicit weapon/armor shapes, different species assembled from primitive meshes; direct world-space authored motion, camera/atlas choices embedded in art. Fast and controllable, disconnected anatomy and lack of reusable skinning/retargeting. Workshop I–IV: accepted source human body, Innerscene CC0 hand, explicit joints and equipment contact checks, CMU BVH, multi-camera review; static grip/art acceptance still failed. Retain the ideas of semantic sockets, actual evaluated meshes, contact audit, stable coordinate frames and separation of aesthetic vs technical gates. Do not port game-specific procedural motion or scene assumptions.
## Candidate architecture
A: pure ES modules, indexed lofts/ellipsoids, skeletal weights, GLB, software SVG and raster preview. No editor, offline, CI CPU. Strong fast stylized/LOD candidate; limits: seam topology, unconvincing anatomy, clothing intersection, basic FK. Prototype implemented.
B: Character Core + parameterized source meshes + adapters. MPFB/MakeHuman assets for humans, curated species-specific mesh/rig families for animals, original modules for fantasy shapes. Headless editor for skin/cloth/retopology, native runtime-independent GLB and existing Art Forge publishing. Recommended research direction; source morph and Art Forge roundtrip implemented as separate experiments, not a complete hybrid character pipeline.
C: high detail source meshes, sculpt/retopo, PBR, cloth and correctives; Blender Geometry Nodes/Python, Cycles GPU locally or CPU in CI. Atlas/offline rendering when warranted. Expensive; opt-in for hero models or close views. No complete high-detail prototype yet.
## Technology matrix (documented, not all executed)
| Tool | License / availability | Automation / computational tradeoff | Decision |
|---|---|---|---|
| MakeHuman / MPFB | core assets CC0; AGPL MakeHuman code, GPLv3 MPFB code; separate third-party terms | targets on fixed topology; scripting, proxies and weights; MPFB requires Blender | priority for hybrid; actual pinned base+height morph experiment |
| MB-Lab / CharMorph | MB-Lab-derived assets AGPL; CharMorph per-base licenses differ | morphing, fitting, rigging, Blender add-on | no unrestricted production assumption; check each base |
| Geometry Nodes/Python/subdivision | Blender GPL, authored output separate | headless, deterministic settings, sculpt/cloth/weights; CPU/RAM cost; Eevee GPU | opt-in adapters; preserve topology and skin |
| Three.js / Babylon.js | MIT / Apache-2.0 respectively | WebGL, WebGPU backends; native glTF animation; GPU limits and browser differences | Three.js real import probe; Babylon evaluation deferred |
| Godot | MIT | runtime/native and Compatibility WebGL2 web export | consumer not anatomy authority |
| SDF/metaballs / marching cubes | implementation-specific; libigl mainly MPL2, some modules other licenses | coherent unions and arbitrary species; voxel sampling memory, topology/weights reconstruction | defer to focused seam experiment |
| Instant Meshes | BSD-style | field-aligned remeshing, not automatic anatomical weight solution | optional retopology; measure shape loss |
| Houdini/KineFX | proprietary; Apprentice noncommercial; Indie commercial limits | non-destructive joint geometry and procedural retarget graph | architectural reference only, no dependency |
| CMU | database terms, research use; check redistribution | BVH source, capture contact analysis; not directly an armed animation | source control, no raw redistribution |
| Quaternius/KinemIQ | specific v1.0 clip pack CC0 | native humanoid rig, clips; animal pack CC0, separate skeletons | prioritized source clip adapter next; not imported in this branch yet |
| Cycles | Blender GPL | CPU supported, CUDA/OptiX RTX locally; high per-frame cost, VRAM varies | detailed offline final only |
| Eevee | Blender GPL | GPU raster; CI headless GPU availability must be tested | compare on same scene when GPU available |
| WebGL/WebGPU | web APIs | browser raster, skinning/instancing; WebGPU must capability-check and fallback | WebGL compatibility baseline; WebGPU optional |
| CPU raster/SVG/Canvas/2.5D | standard APIs/tools | lightweight CPU preview, depth-sort approximation; PNG sprite batching avoids per-agent 3D skinning | actual fast previews and synthetic Canvas benchmark; no game FPS claims |
## Public sources
- https://static.makehumancommunity.org/about/license.html ; https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md ; https://extensions.blender.org/add-ons/mpfb/
- https://github.com/Upliner/CharMorph/blob/master/license.txt
- https://github.com/wjakob/instant-meshes ; https://github.com/libigl/libigl
- https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/ ; https://docs.blender.org/manual/en/latest/render/eevee/limitations/limitations.html
- https://www.sidefx.com/docs/houdini/character/kinefx/overview.html ; https://www.sidefx.com/faq/question/apprentice-licenses/
- https://threejs.org/manual/pages/webgpurenderer ; https://github.com/BabylonJS/Babylon.js ; https://docs.godotengine.org/en/latest/tutorials/export/exporting_for_web.html
- https://mocap.cs.cmu.edu/faqs.php ; https://github.com/Kinemiq/free-game-animations ; https://quaternius.com/packs/ultimateanimatedanimals.html
## Core contract
Metres, +Y up, +Z forward. Versioned recipe/spec, explicit seed, morphology/limits/actions, GLB budget, provenance. Joint hierarchy parent-before-child, local rest translation and anatomical role/axis/range; parts hold positions/indices/normals and four normalized weights. Per-family templates: humanoid, horse, dog, elephant, bird. Elephant trunk chain; wings/tail separate roles. Composition uses parent attachment (saddle/seat), not a humanoid skeleton reused for animals. Reusable surface loft, limb, equipment and human builder. Future registry: data-defined custom species, joint local rotations, multi-axis limits, external skin/morph/cloth adapters, component constraints and licensed asset registry. Current recipes are code-defined, not a complete generic arbitrary-anatomy DSL.
Profiles: Simplified reduced tessellation; Miniature exaggerated head/width; Realistic high-density test only (not anatomical realism). Morphology actually affects geometry, proportions and material; age currently color only. Composite rider/crew feet do not yet have rein/seat constraint solver; generic FK clips are diagnostic, not accepted natural motion. No joint-contact locking, retargeting, root locomotion, multi-actor blending or correctives yet.
CLI: node tools/character-forge/cli.mjs spec.json new-output-dir
API: build(spec), animation(model,action,phase), pose(), deform(), glb(), preview().
Example spec: {"version":1,"recipe":"rider","profile":"miniature","seed":17,"morphology":{"height":1.62,"build":1.1},"actions":["idle","walk","run","turn"],"budget":{"maxTriangles":100000,"maxJoints":128,"maxBytes":16000000},"format":"glb"}.
Research output is isolated, atomically installed in a new path, never overwrites approved output. Production only through existing Art Forge after review.
## Experiments and gates
CI core: seven recipes × three profiles, three same-recipe variants, indexed GLB and editable JSON, PNG profile sheets, 16-frame walk evidence. Batch 1/10/100 each profile: geometry+rig, export+animation, wall, CPU, sampled RSS and byte output. Browser imports actual composite skinned GLB and animations on Chromium/WebKit, synthetic 240-sprite Canvas scenes at 24/48/96 pixels; not Banners game acceptance. Morph: raw pinned MakeHuman topology and two height targets, no clothes or rig. Bridge: actual Art Forge v2 plan/build/check and native re-import in isolated temporary owner. Metrics from artifacts only, no invented measurements. No GPU/VRAM result until real hardware test. Full atlas and 1080p multi-camera withheld.
## Roadmap
1. Validate all CI evidence and direct visual sheets. Reject unattractive prototypes; measure joints and contact on actual skin.
2. Curated CC0 human body + hand sources, native KinemIQ retarget, animal asset/rig sources; compare A/B/C source preservation. Build topology welding and clothing fit, not merely color changes.
3. Data-defined specialized anatomy, constraints and semantic animation graph; surface contact, actual sole trajectories, coordinated mount/reins and multi-creature choreography.
4. Character Studio research preview controls and export; optional editor, no mandatory GUI. Port to Art Forge manifest input with explicit source hashes and licenses. Add existing Universal QA app-specific gates only after a consumer is approved.
5. Benchmark Blender/Eevee/Cycles, WebGL/Babylon/Godot, WebGPU fallback, offline atlas at target scales; local RTX 3080 10GB / RAM32GB, report actual VRAM and CPU. Banners engine unchanged and 30 FPS gate unchanged. No purchase.


## v0.19 — Rigid Motion / Residual Deformation Qualification

Status: isolated research only. Character Core, production GLB, Art Forge publication and Banners of War remain unchanged.

### Cloth and collision experiment

The v0.18 evidence isolated the moving right-trouser collider as the dominant contact variable. v0.19 decomposes its 92-point outer collision surface into a best-fit proper rigid transform (translation + rotation) and the remaining local surface deformation. An exact reconstruction check verifies that the two components reproduce the original world-space geometry.

The Blender transfer matrix compares per-vertex shape keys, rigid object transform only, residual shape keys only, and rigid object transform plus residual shape keys. Exact modes must reproduce every evaluated world-space frame within 1e-5 m. Approximation modes are diagnostic controls only. The physical solver is compared at friction 5 and 20 on the lossless split representation. No friction value is accepted unless stretch, self-contact, external contact and hem-shape gates all pass.

### Hand comparison

C-matched and D-matched reuse the per-joint MakeHuman flexion magnitudes measured for B-matched. MCP, PIP and DIP are matched independently across five phases. The audit checks all 15 joint/phase samples and independently verifies GLB playback. This separates corrective-surface effects from differences in input pose severity.

### Acceptance boundaries

- Continuous Motion / Cyclic 49 remains frozen.
- No Remesh production gate is relaxed.
- Geometric reconstruction alone does not grant production reuse.
- Cloth acceptance still requires full dynamic/root-motion qualification, independent contact audit and artistic review.
- Hand acceptance still requires anatomical and visual approval; matching angles is only a fair comparison control.
- Banners of War remains untouched.


## v0.20.1 — Equal Simulation-Time FPS Qualification

Status: diagnostic-only; production remains blocked.

The first v0.20 matrix is retained as evidence but rejected for comparative acceptance. It increased scene FPS while also setting Blender Cloth `time_scale=1/factor`. Blender's point-cache time delta already follows scene time; Cloth then multiplies that delta by `time_scale`. The inverse factor therefore scaled elapsed solver time twice. The old velocity diagnostics also multiplied per-frame displacement by `sceneFps * clothTimeScale`, which made the same collider path appear proportionally slower at 48 and 96 FPS.

The corrected v0.20.1 matrix keeps `time_scale=1.0` at 24/48/96 FPS. Scene FPS alone supplies the smaller physical frame interval and higher solver evaluation count. Source motion is sampled at a stride of 1/2/4 source frames per scene frame so the same animation path, warm-up, pin transition and total scene-time duration are preserved.

Every run now records and checks:
- exact simulation frame count;
- scene-time duration;
- actual solver elapsed time: `(frameIntervals * clothTimeScale) / sceneFps`;
- source-motion and warm-up duration;
- collider surface speed measured in scene time;
- pinned-target speed measured in scene time;
- agreement of collider and pin-path speeds across all three frame rates.

A run is invalid if solver elapsed time differs from the expected 2.75 seconds or if collider/pin path speeds differ materially from the 24 FPS baseline. The original v0.20 JSON and renders remain untouched. No production qualification is inferred from a successful time-resolution experiment.


## v0.20.1 — closed negative time-resolution experiment

Research run 46086149619, artifact 15239821391, source HEAD d7a61f2. At time_scale=1.0, 24/48/96 FPS replay 67/133/265 frames over 2.75 s with matched source velocity. Peak stretch 3.074/3.538/4.826, self pairs 20/63/30, external pairs 13/19/44. All fail. Do not continue blind FPS, stiffness or friction sweeps. The v0.20 inverse-time-scale attempt was superseded by v0.20.1.

## v0.21 — dynamic contact investigation (research, no admission)

The same free-surface edges recur roughly 150–249 mm from the pinned seam. Prior archived frames show contact near the terminal cap and abrupt triangle normal transitions; this is a hypothesis, not a measured solver impulse. Contact diagnostics preserve old scalar metrics and add elapsed seconds, source phase, barycentric velocity, signed closed-proxy geometric penetration at sampled points, adjacent-normal dihedral angle, area ratios, and independent exhaustive nearest-triangle checks. No direct impulses are exposed by the Blender Python path. Point probes do not certify continuous swept collision.

One-factor 24 FPS matrix A original outer, B bounded geometric smoothing, C measured axis-section projection, D numerical collider outer margin 3 mm (cloth distance unchanged), E flip diagonal 106–139 without adding vertices, F partial first-ring pin transition. B/C are limited to 2 mm vertex displacement and 4 mm bidirectional sampled surface discrepancy. The triangle solver still uses piecewise normals, not interpolated shading normals. No production gates are changed and no isolated run can grant production approval. The original full dynamic gate, root motion and artistic acceptance remain required. Every matrix binds the source and code hashes and actual Blender version. Independent job reruns may be explored, but do not reuse unverified artifacts or skip final CI.

### v0.21 — anatomy preservation

Preserve original A/B/C/D and their matched controls. C-area, C-volume and C-combined use a bounded 2 mm additional rest-space morph correction on the same local MCP region, same eight weights, same topology, same five matched poses. The volume term is the signed local patch volume closed to its fixed boundary centroid (not whole-finger volume). A deterministic coordinate search optimizes log area distortion and/or local patch volume with a displacement penalty; the combined candidate includes both. Actual GLB morph-before-skin and quaternion track audits, area quantiles, strict triangle intersections and all five existing morphotypes are reported. Candidate objective improvement is not admission; grip remains blocked. Identical camera comparisons and area maps are emitted.
