# CRUMPLE // YARD

CRUMPLE // YARD is a portrait-first Pocket Works driving game built around one mechanic: the car remains a physical machine after the first crash instead of becoming a health bar with a damaged skin.

## Runtime

- Babylon.js renders the scene and the deformable vehicle shells.
- Rapier 3D owns rigid-body collision resolution, ray-cast suspension, wheel forces and contact-force events.
- The vehicle shell is a custom updatable mesh. Impact points are transformed into chassis-local space and permanently move nearby vertices with bounded falloff.
- Structural damage and mechanical damage are separate. The former changes local weakness and deformation; the latter feeds back into steering, wheel support, cooling, power, lights and drivability.
- Detachable panels become their own Rapier rigid bodies after severe local damage.

The deformable shell is generated at runtime on purpose: its vertex topology is part of the gameplay model and must stay directly addressable after every impact. Hidden collision remains a compact rigid proxy so the car does not become a soft-body jelly.

## Cars

- Kestrel — 1080 kg compact, quick steering, short wheelbase, low crush capacity.
- Meridian — 1490 kg sedan, balanced grip, stable suspension and medium structural reserve.
- Bastion — 2220 kg SUV, high inertia and crush reserve, slower steering, stronger impacts.

Each has three paint/wheel trim presets without a separate asset load.

## Damage pipeline

Rapier contact-force events provide the measured force and collision pair. The game combines that with relative closing speed, reduced mass, contact geometry, obstacle stiffness/contact area, zone orientation and previous local damage. The result is distributed through neighbouring structural and mechanical components. Repeated hits into a weakened area amplify deformation and failures.

## Arena

The yard is deliberately compact: concrete walls, narrow gate, steel poles, crash blocks, a ramp, dynamic crates, offset barriers and autonomous traffic create front, side, rear, pole and car-to-car impacts without a long drive.

## Mobile controls

The lower-left steering surface is direct analog input. The right side has only two pedals: DRIVE and BRAKE / REVERSE. Camera movement is automatic; there is no second virtual stick.

## Persistence and QA

The app saves the chosen car, trim, sound and graphics preference under pocket-works:crumple-yard. window.__CRUMPLE_TEST_STATE__ exposes runtime telemetry for automated mobile gameplay checks: speed, impact count, damaged zones, mechanical multipliers, physics quality, selected vehicle and boot state.
