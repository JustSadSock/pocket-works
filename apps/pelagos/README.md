# PELAGOS

PELAGOS is a portrait-first 3D sailing game for Pocket Works, tuned for iPhone Safari and the shared Pocket Works mobile runtime.

## Core loop

Sail an effectively endless procedural ocean. The boat is driven by forces rather than direct coordinate changes: apparent wind, sail trim, rowing impulses, hydrodynamic drag, keel side force and a speed-dependent rudder all feed the same rigid-body-style state. Hull support samples query the same eight-component cross-swell wave field used by the water shader, producing heave, pitch and roll from the visible sea.

## Vessel scale and modular architecture

The current ship is explicitly defined as **PELAGOS Cutter 30**, not as an arbitrary scale model:

- structural hull: **9.13 m**;
- waterline: **8.24 m**;
- overall length with bowsprit: about **11.7 m**;
- beam: **3.48 m**;
- draft: **1.65 m**;
- displacement target: about **5.6 t**.

`source/ship-config.ts` is the authoritative ship registry. A vessel definition owns its Blender hull asset, physical dimensions, hull palettes, sail plans and oar sets. Runtime systems resolve one `ShipLoadout`, so adding another vessel later does not require cloning the PELAGOS simulation or UI.

The in-game **Верфь** persists the selected hull class, paint scheme, sail plan and rowing set independently from voyage progress. Structural changes reload the scene cleanly rather than trying to hot-swap a partially simulated hull in place. The default Cutter 30 now carries **six rowing stations per side / twelve physical oars**; alternative five- and six-pair sets already exercise the same modular path.

## Mobile interaction

- left thumb: direct helm drag with nonlinear sensitivity and spring release;
- right thumb: persistent sail trim with an ideal-trim marker;
- hold **ГРЕСТИ** for water-contact-gated rowing impulses from the selected modular oar set;
- drag the sea to look around; a single-authority chase camera filters yaw and heave without accumulating offsets;
- Pointer Events use Pocket Works `bindPointerGesture`, including pointer cancellation and lost capture recovery;
- simulation uses a fixed 60 Hz step with delta-time clamping after Safari suspension;
- visibility/background events pause simulation and audio and require an intentional touch before audio resumes.

## Rendering and authored assets

Babylon.js Enhanced runtime with Pocket Works Blender Asset Forge:

- Blender 5.2.1 LTS authors `public/models/pelagos-cutter.glb` from deterministic app-local Asset Forge sources;
- the GLB provides the structural cutter hull, fully closed transom, cambered deck, keel/stem/sternpost, cap rails, handrails, stanchions, cockpit, companionway, hatch, chainplates, cleats and other hard-surface detail;
- the 1.5 craft pass adds working-looking deck fittings and authored pivots for the helm, compass, stern lanterns, bell, anchors and sheet blocks;
- the authored finish uses separate PBR materials for oxblood oak, honey deck planking, mahogany rails, tarred seams, warm ivory trim, sea-green paint, aged brass and black iron; the modular palette layer can remap the major hull colors without regenerating the GLB;
- if the authored GLB cannot load, the previous procedural structural hull remains available as an automatic runtime fallback;
- physical mass-spring mainsail and jib, responsive running rigging, rudder and modular rowing oars remain runtime systems so they react continuously to wind, hull motion and water contact instead of being frozen into the GLB;
- sail telltales and the mast pennant expose local apparent-wind behaviour directly on the vessel, including luffing and gust response;
- shared eight-component analytic/choppy ocean displacement and normals with spatial swell groups;
- Fresnel water, micro-ripples, sun glints, whitecaps, hull-contact foam, bow spray and a persistent turbulent wake;
- dynamic wet waterline, procedural surface treatment and reflected ocean bounce light;
- shader-driven dynamic sky with clouds, sun, moon, stars and sunset transition;
- pooled procedural rocks, buoys and driftwood that follow the same wave field;
- rain, spray and oar splash particle systems;
- adaptive internal render scale for sustained mobile performance.

## Hydrodynamics

The 1.5 hydrodynamic layer treats the cutter as a broad displacement hull rather than a point riding on whichever crest happens to be highest. It samples bow, stern, port, starboard and centre support, uses a trimmed reference surface for heave, adds an added-water response to the 5.6-tonne displacement, and derives attitude from the fore/aft and port/starboard support planes. One short wave can still pitch the bow or throw spray, but it cannot launch the entire hull like a light toy.

A stern-immersion restoring term activates only when the aft shoulder would rise through its local surface. The gameplay rudder blade is mounted deeper below the transom, so its working area stays submerged while the visible stock/tiller can still articulate normally.

## Camera

The final camera transform is owned by `camera-stabilizer.ts`. Earlier visual passes may calculate their own framing, but they cannot accumulate motion into the final view: every rendered frame is rebuilt from the current ship transform, filtered chase yaw, a smoothed translation anchor and the user's look offset. Large floating-origin shifts trigger a bounded snap instead of a long camera flight across the world.

## Persistence and offline

Settings, onboarding state and accumulated voyage distance use the shared versioned Pocket Works storage capability. The ship loadout has its own small persistent key so future hull/equipment progression can evolve independently. The application owns its Workbox service worker, cache namespace and install manifest and remains isolated under `apps/pelagos/`.

## Automated gameplay QA

The app exposes a read-only `window.__POCKET_WORKS_TEST_STATE__` snapshot for the repository mobile gameplay workflow. Playwright can assert that the authored Blender vessel is loaded, read the selected ship class/palette/sail/oar modules, verify the twelve-oar default, observe hull length/displacement and monitor stern exposure/heave clearance while it captures real Chromium/WebKit gameplay frames. This bridge is diagnostics-only and does not alter production controls or simulation state.

## Development

```bash
npm run test --workspace @pocket-works/pelagos
npm run typecheck --workspace @pocket-works/pelagos
npm run build --workspace @pocket-works/pelagos
npm run registry:check
```
