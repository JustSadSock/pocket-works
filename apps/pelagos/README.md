# PELAGOS

PELAGOS is a portrait-first 3D sailing game for Pocket Works, tuned for iPhone Safari and the shared Pocket Works mobile runtime.

## Core loop

Sail an effectively endless procedural ocean. The boat is driven by forces rather than direct coordinate changes: apparent wind, sail trim, rowing impulses, hydrodynamic drag, keel side force and a speed-dependent rudder all feed the same rigid-body-style state. The 1.5 hydrodynamics layer then treats the vessel as a long displacement hull rather than a collection of independent corks: a weighted 15-point footprint samples the shared wave spectrum, short chop is attenuated by hull-length response, and heave, pitch and roll track the broader water plane with bounded vertical separation.

The default vessel is now the **Long Cutter**, approximately **12.8 m long × 3.9 m beam**, with a 1.18 m nominal draft and **six rowing sweeps per side**. Its scale is explicit rather than inferred from camera framing.

## Modular vessel architecture

Ship configuration lives in `source/ship-loadout.ts` instead of being hard-coded into one visual model. A loadout independently defines:

- physical dimensions and waterline;
- hull/deck/trim/sail/oar palette;
- mainsail and jib proportions;
- oar count, station spacing, shaft/blade dimensions and stroke geometry.

The current runtime ships with Long Cutter, Storm Cutter and Raider Cutter loadouts. `source/ship-modularity.ts` applies those definitions to the Blender/procedural vessel root, runtime sails and a generated oar bank. A diagnostics/future-shipyard bridge is exposed as `window.__PELAGOS_SHIPYARD__` with `list()`, `get()` and `set(id)` so future progression and upgrade UI can swap loadouts without rebuilding the scene architecture.

## Mobile interaction

- left thumb: direct helm drag with nonlinear sensitivity and spring release;
- right thumb: persistent sail trim with an ideal-trim marker;
- hold **ГРЕСТИ** for water-contact-gated rowing impulses; the Long Cutter presents twelve independently animated sweeps;
- drag the sea to look around; a single-authority chase camera filters yaw and heave without accumulating offsets;
- Pointer Events use Pocket Works `bindPointerGesture`, including pointer cancellation and lost capture recovery;
- simulation uses a fixed 60 Hz step with delta-time clamping after Safari suspension;
- visibility/background events pause simulation and audio and require an intentional touch before audio resumes.

## Water interaction

The visible ocean and vessel physics consume the same analytic wave spectrum. The 1.5 refit adds a hull-scale response filter so sub-metre chop can create surface detail without unrealistically lifting the entire ship. Fifteen samples across the configured hull footprint establish the local mean water plane and its motion; bow/stern and port/starboard pairs drive pitch and roll. Vertical velocity is coupled to the water's orbital motion, while a bounded breach guard prevents a crest from catapulting the stern clear of the surface. Bow-down pitch is deliberately tighter than bow-up pitch so the rudder remains immersed through normal sea states.

The rudder blade itself is also seated deeper relative to the hull. The tiller and stock remain visually readable, but the working blade should be almost entirely underwater during ordinary sailing.

## Rendering and authored assets

Babylon.js Enhanced runtime with Pocket Works Blender Asset Forge:

- Blender 5.2.1 LTS authors `public/models/pelagos-cutter.glb` from deterministic app-local `asset-forge/ship.py` + `ship_final.py` sources;
- the GLB provides the structural cutter hull, fully closed transom, cambered deck, keel/stem/sternpost, cap rails, handrails, stanchions, cockpit, companionway, hatch, chainplates, cleats and other hard-surface detail;
- the authored finish uses separate PBR materials for oxblood oak, honey deck planking, mahogany rails, tarred seams, warm ivory trim, sea-green paint, aged brass and black iron;
- runtime loadouts can recolor named material families without duplicating the authored geometry;
- if the authored GLB cannot load, the procedural structural hull remains available as an automatic runtime fallback and receives the same loadout scaling;
- physical mass-spring mainsail and jib, responsive rigging, rudder and generated rowing sweeps remain runtime systems so they react continuously to wind, hull motion and water contact instead of being frozen into the GLB;
- sail telltales and the mast pennant expose local apparent-wind behaviour directly on the vessel, including luffing and gust response;
- shared analytic/choppy ocean displacement and normals with spatial swell groups;
- Fresnel water, micro-ripples, sun glints, whitecaps, hull-contact foam, bow spray and a persistent turbulent wake;
- dynamic wet waterline, procedural surface treatment and reflected ocean bounce light;
- shader-driven dynamic sky with clouds, sun, moon, stars and sunset transition;
- pooled procedural rocks, buoys and driftwood that follow the same wave field;
- rain, spray and oar splash particle systems;
- adaptive internal render scale for sustained mobile performance.

## Camera

The final camera transform is owned by `camera-stabilizer.ts`. Earlier visual passes may calculate their own framing, but they cannot accumulate motion into the final view: every rendered frame is rebuilt from the current ship transform, filtered chase yaw, a smoothed translation anchor and the user's look offset. Large floating-origin shifts trigger a bounded snap instead of a long camera flight across the world.

## Persistence and offline

Settings, onboarding state and accumulated voyage distance use the shared versioned Pocket Works storage capability. The application owns its Workbox service worker, cache namespace and install manifest and remains isolated under `apps/pelagos/`.

## Automated gameplay QA

The app exposes a read-only `window.__POCKET_WORKS_TEST_STATE__` snapshot for the repository mobile gameplay workflow. Playwright can assert that the authored Blender vessel is loaded, the physical mainsail is active, floating motion cues exist and rowing input reaches the simulation while it captures real Chromium/WebKit gameplay frames. This bridge is diagnostics-only and does not alter production controls or simulation state.

The modular vessel layer additionally exposes `window.__PELAGOS_SHIPYARD__` for deterministic loadout inspection during development and future progression work.

## Development

```bash
npm run test --workspace @pocket-works/pelagos
npm run typecheck --workspace @pocket-works/pelagos
npm run build --workspace @pocket-works/pelagos
npm run registry:check
```
