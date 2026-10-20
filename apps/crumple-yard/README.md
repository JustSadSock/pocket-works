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

Version 1.2.0 adds a fixed-world-azimuth follow camera by default. Toggle fixed/chase in the garage or pause sheet; the selected camera survives reload. This follows car translation and does not orbit with its heading. Existing Rapier contact damage and all other car apps are preserved. Tests include 20 Vitest cases, Chromium and WebKit touch-sized drive/turn/pause/camera/reload loops and a real frontal crash yielding nonzero shell deformation, debris and reduced engine/steering authority.

## Version 1.3 — built-out damage stage

- Vehicle modeling is now split between independent 25-ring / 14-point crushable hulls and a fully constructed, collision-free visual detail kit. Hatch, sedan and SUV have different greenhouse and exterior profiles. Panels and wheels keep their original detached Rapier bodies.
- Each wheel is composed of a rubber tyre, machined alloy hub, brake disc, spokes and rim lip. The scene includes shaped safety targets, gantry details, industrial posts, reinforced crates and a ramp with ribs.
- Brake-to-reverse uses a persistent low-speed gear instead of cancelling reverse once the car accelerates. Progressive steering and skid particulate response borrow the approachable feel of Mini Car 3D but do not replace CRUMPLE's raycast suspension or damage-dependent wheel dynamics.
- The real 3D garage car can be rotated with a pointer swipe without affecting the heading when the player drives out.
- A dedicated application smoke visual suite captures garage, active driving and pause states on phone and desktop.

Mini Car 3D remains a separate app: no shared modules, linked save games or runtime dependencies were introduced.

## Version 1.4 — inspection, gameplay loop and source review

- Garage mode now frames the vehicle separately from driving, with a physical-looking indexed inspection platform. On desktop the car is the main stage and the console is arranged to the left; on phones the preview is framed above the selection buttons.
- A roof insert, dashboard, seats, rear seats, headrests and steering wheel make the glazing show an occupied cabin rather than a hollow cage. Roof panel and windshield have independent damage reactions.
- Crash barrels and crates are close to the spawn. Their Rapier rigid bodies, collision categories and contact materials are real, not decorative obstacles. The initial positions are restored when starting a new driving session from the garage.
- The HUD reports measured force (kN) and relative closing speed (km/h) rather than incorrectly identifying closing speed as delta-v.
- Brake/reverse gear transitions are independently regression-tested; hidden-key stale state and teardown collider/shadow bookkeeping have been repaired.
- The new automated screenshot sequence records Kestrel, Bastion and Meridian, driving, and pause states in Chromium and WebKit on mobile and desktop. Real visual approval still requires reviewing those screenshots.
