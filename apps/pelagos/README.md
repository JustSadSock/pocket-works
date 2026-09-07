# PELAGOS

PELAGOS is a portrait-first 3D sailing game for Pocket Works, tuned for iPhone Safari and the shared Pocket Works mobile runtime.

## Core loop

Sail an effectively endless procedural ocean. The boat is driven by forces rather than direct coordinate changes: apparent wind, sail trim, rowing impulses, hydrodynamic drag and a speed-dependent rudder all feed the same rigid-body-style state. Eight hull sample points query the same mathematical wave field used by the water shader, producing heave, pitch and roll from the visible sea.

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

- analytic multi-wave ocean displacement and normals;
- Fresnel reflection approximation, sun path, foam, wake and storm response;
- procedural ship model with hull, deck, mast, rigging, sail, rudder, four animated oars, iron fittings and lanterns;
- shader-driven dynamic sky with sun, moon, stars and sunset transition;
- pooled procedural rocks, buoys and driftwood;
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
