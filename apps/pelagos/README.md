# PELAGOS

PELAGOS is a portrait-first 3D sailing game for Pocket Works, tuned for iPhone Safari and the shared Pocket Works mobile runtime.

## Core loop

Sail an effectively endless procedural ocean. The boat is driven by forces rather than direct coordinate changes: apparent wind, sail trim, rowing impulses, hydrodynamic drag, keel side force and a speed-dependent rudder all feed the same rigid-body-style state. Ten hull sample points query the same six-component mathematical wave field used by the water shader, producing heave, pitch and roll from the visible sea.

## Mobile interaction

- left thumb: direct helm drag with nonlinear sensitivity and spring release;
- right thumb: persistent sail trim with an ideal-trim marker;
- hold **ГРЕСТИ** for physical rowing impulses;
- drag the sea to look around; the chase camera recenters smoothly;
- Pointer Events use Pocket Works `bindPointerGesture`, including pointer cancellation and lost capture recovery;
- simulation uses a fixed 60 Hz step with delta-time clamping after Safari suspension;
- visibility/background events pause simulation and audio and require an intentional touch before audio resumes.

## Rendering

Babylon.js Enhanced runtime with:

- shared six-component analytic/choppy ocean displacement and normals;
- Fresnel water, micro-ripples, sun glints, whitecaps, bow foam, V-shaped wake and storm response;
- procedural ship model with shaped hull, deck, keel, cabin, helm, mast, yard, boom, bowsprit, rigging, dynamic cloth sail + jib, rudder, anchors, four animated oars and lantern lighting;
- procedural wood, deck and canvas materials with dynamic shadows;
- shader-driven dynamic sky with clouds, sun, moon, stars and sunset transition;
- pooled procedural rocks, buoys and driftwood that follow the same wave field;
- spray, rain and oar splash particle systems;
- adaptive internal render scale for sustained mobile performance.

## Persistence and offline

Settings, onboarding state and accumulated voyage distance use the shared versioned Pocket Works storage capability. The application owns its Workbox service worker, cache namespace and install manifest and remains isolated under `apps/pelagos/`.

## Development

```bash
npm run test --workspace @pocket-works/pelagos
npm run typecheck --workspace @pocket-works/pelagos
npm run build --workspace @pocket-works/pelagos
npm run registry:check
```
