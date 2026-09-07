# SINEW

SINEW is a landscape-first Babylon.js duel inside Pocket Works. The player fights one shielded opponent using only two thumb surfaces: analog locomotion on the left and body/look control on the right.

The core mechanic is **pose target → spring/inertia → actual body pose**. Camera motion drives a constrained procedural upper body; weapon damage comes from swept blade motion and real contact, while shield defense is spatial rather than a boolean block state.

## Product goals

- visible first-person body with inertial torso, arms, sword and shield;
- analog acceleration/deceleration and procedural lower-body motion;
- swept weapon collision for sword/body, sword/shield and sword/sword contact;
- readable AI that uses the same weapon/shield pose system;
- minimal HUD and exactly two persistent gameplay touch regions;
- stable landscape Safari/iPhone behavior through the Pocket Works mobile runtime;
- offline PWA packaging and adaptive quality.

## App boundary

Everything required by SINEW stays under `apps/sinew/`. It consumes the existing shared mobile runtime and enhanced update manager without changing platform files.
