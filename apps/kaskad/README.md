# KASKAD

KASKAD is a mobile-first, offline visual simulation laboratory for Pocket Works. It lets people combine particle species, force fields and event rules without writing code.

## Main loop

1. Choose one of three starter systems or begin from the current scene.
2. Add and edit particle species.
3. Add global force fields.
4. Build rules in the form `trigger → condition → action`.
5. Run, pause, step, reset, record or export the scene.

## Simulation systems

- circular and rectangular arenas;
- elastic particle collisions;
- gravity, attractor, vortex, wind, turbulence and hue-affinity fields;
- wall, particle, interval and tap triggers;
- spawn, split, transform, destroy, accelerate, resize, burst and field-toggle actions;
- capacity safeguards and adaptive render density;
- local scene persistence, JSON import/export and canvas recording.

## Mobile behavior

The canvas owns direct gestures. A tap spawns the selected species; a drag emits a stream. The lower workbench scrolls independently. The app uses the shared Pocket Works mobile runtime and update manager.
