# PELAGOS

PELAGOS is a portrait-first 3D sailing game for Pocket Works, tuned for iPhone Safari and the shared Pocket Works mobile runtime.

## Core loop

Sail an effectively endless procedural ocean. The boat is driven by forces rather than direct coordinate changes: apparent wind, sail trim, rowing impulses, hydrodynamic drag, keel side force and a speed-dependent rudder all feed the same rigid-body-style state. Ten hull sample points query the same eight-component cross-swell wave field used by the water shader, producing heave, pitch and roll from the visible sea.

## Mobile interaction

- left thumb: direct helm drag with nonlinear sensitivity and spring release;
- right thumb: persistent sail trim with an ideal-trim marker;
- hold **ГРЕСТИ** for water-contact-gated rowing impulses from eight smaller oars;
- drag the sea to look around; a single-authority chase camera filters yaw and heave without accumulating offsets;
- Pointer Events use Pocket Works `bindPointerGesture`, including pointer cancellation and lost capture recovery;
- simulation uses a fixed 60 Hz step with delta-time clamping after Safari suspension;
- visibility/background events pause simulation and audio and require an intentional touch before audio resumes.

## Rendering and authored assets

Babylon.js Enhanced runtime with Pocket Works Blender Asset Forge:

- Blender 5.2.1 LTS authors `public/models/pelagos-cutter.glb` from deterministic app-local `asset-forge/ship.py` + `ship_final.py` sources;
- the GLB provides the structural cutter hull, fully closed transom, cambered deck, keel/stem/sternpost, cap rails, handrails, stanchions, cockpit, companionway, hatch, chainplates, cleats and other hard-surface detail;
- the final authored finish uses separate PBR materials for oxblood oak, honey deck planking, mahogany rails, tarred seams, warm ivory trim, sea-green paint, aged brass and black iron; longitudinal hull strakes and a raised PELAGOS transom board break up the previous plastic-shell look;
- if the authored GLB cannot load, the previous procedural structural hull remains available as an automatic runtime fallback;
- physical mass-spring mainsail and jib, responsive rigging, rudder and eight rowing oars remain runtime systems so they react continuously to wind, hull motion and water contact instead of being frozen into the GLB;
- shared eight-component analytic/choppy ocean displacement and normals with spatial swell groups;
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

## Development

```bash
npm run test --workspace @pocket-works/pelagos
npm run typecheck --workspace @pocket-works/pelagos
npm run build --workspace @pocket-works/pelagos
npm run registry:check
```
