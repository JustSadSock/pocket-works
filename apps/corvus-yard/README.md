# CORVUS · Над дворами

An isolated Babylon.js crow flight game inside PocketWorks. Authored local GLBs contain a feathered crow with a real skeleton and named animation clips, and an autumn canal district. No remote assets or subscriptions are required.

Controls: left stick turns and controls height (moves forward/back on foot); hold Wing to take off and gain speed; release to glide; hold Landing to brake and assist a close slow approach to a perch. E picks up/eats food; Q drops an object. WASD, Space and Shift also work. Start, pause and completion screens have explicit PocketWorks exit links.

The short progression is two meals, one walnut cracked by dropping it on a hard surface, and a landing at the bell-tower finial. Exploration remains available afterward. Consumed food and cracked nuts are persisted independently so reload cannot count them twice. A water contact returns to the home branch. Settings/progress save on pause and suspension.

Modules: flight/core (renderer-independent forces and locomotion), crow (authored clips and non-accumulating head/tail adjustments), world (geometry, contact support, colliders, wind), ecology (food, ballistic carried objects, reactive birds), camera/input/audio, main (integration and UI).

Build and tests:

```sh
npm run build --workspace @pocket-works/corvus-yard
npm run registry:check
```

Generated runtime files are not source-controlled; CI and Cloudflare build them from source. The models in public/models are committed. Deterministic Blender sources and the Asset Forge manifest are in asset-forge.

Visual release 1.1: the player raven has 61 authored joints and 14 named clips, including blink channels, preening, pecking, ruffling and calling. Feather blades carry a shared packed vane texture. Folded primary and secondary feathers have individual hinge poses; their lengths remain intact. The flock uses a decimated version of the same rig. Inactive clips and distant idle flock animation pause to limit animation cost. A small moving shadow map is reserved for balanced rendering; adaptive performance uses the cached district shadows and contact effects.

Visual release 1.2 corrects the upper coverts' skin weights: they now follow their individual primary/secondary hinges instead of folding as one full-span rigid fan. Preening turns and retracts the neck to reach the scapular plumage. Landing closes those rigid poses smoothly, settles the body and plants the feet at the support height. The chase camera sits closer with a lower ground look target. Neutral PBR tone mapping and brighter ochre/copper foliage retain more material color. Canal normals, sky Fresnel and the sun highlight respond to the camera angle; this is a local analytic sky reflection, without scene-space building reflections or a costly reflection pass.

The district now has porous, individually lobed autumn leaves, fine twigs and roots, patterned bark/stone/slate, rain pipes, doorstep detail and a distant roofline. A local sky shader separates cool cloud light from a warm sun break. Runtime assets remain local and offline cached.

The reimported landing foot heights are also checked at five clip samples by `qa/validate-land.py`; the report is saved in `qa/evidence/landing-contact.json`.

Validation covers 29 flight, collision and ecology tests, TypeScript, Vite/PWA and registry validation. The browser runner also observes preen/ruffle/call clips and captures their real rendered states with `CORVUS_QA_VISUAL=1`. Physical iPhone performance has not been measured.

The browser runner starts its own HTTP server and never mutates the gameplay state. Full progression is enabled explicitly:

```sh
CORVUS_QA_FULL=1 npm run test:gameplay --workspace @pocket-works/corvus-yard
```

`CORVUS_QA_BROWSERS` selects Chromium/WebKit, `CORVUS_CHROMIUM_PATH` and `CORVUS_WEBKIT_PATH` override browser executables, and `CORVUS_QA_DIR` selects report/screenshots output. `CORVUS_QA_NATIVE_OFFLINE=1` verifies the cache by stopping the embedded HTTP server; this avoids a WPE WebKit offline-emulation protocol error. Local evidence lives under `qa/evidence/`.

Both full browser runs and reviewed screenshots are in `qa/evidence/chromium-acceptance/` and `qa/evidence/webkit-acceptance/`; reload and offline return retained two meals, one cracked walnut and the bell-tower visit. Additional roof/perch/collision traversal remains outside this automated acceptance route. Real iPhone/Safari performance still requires physical-device validation. The current environment uses headless Chromium and Linux WebKit, not mobile Safari.
