# Game motion and scene composition

`shared/game-production/motion.js` is a deterministic gameplay timeline around existing Babylon `AnimationGroup`s. A game's loop calls `controller.update(deltaMs)`. Clips are supplied by the game; the module does not import Babylon or claim to retarget skeletons. `setState` blends idle/walk/run groups. `trigger` starts named phases with timed contact events, optional hit stop and a return state. Route events into target reactions, camera impulses, particles and audio in the app. The same event drives all those cues, so they remain synchronized. Call `dispose` on teardown.

```js
const motion = createMotionController({
  clips: { idle: idleGroup, windup: windupGroup, strike: strikeGroup, recover: recoverGroup },
  actions: { sword: { returnTo: 'idle', phases: [
    { clip: 'windup', duration: 90 },
    { clip: 'strike', duration: 70, events: [{ at: 25, type: 'contact', hitStopMs: 55 }] },
    { clip: 'recover', duration: 160 }
  ] } },
  onEvent(event) { if (event.type === 'contact') applySwordContact(event); }
});
```

`shared/game-production/environment.js` plans X/Z positions for authored assets with deterministic seeds. `composeEnvironment` and its `composeVillage` preset reserve the focal point and camera sightline, cluster secondary objects, dress edges and enforce spacing. The result is data; the app instantiates asset meshes and handles collision, terrain height and navmesh checks. Any shortfall appears in `skipped` rather than being filled by overlapping props.

Neither module provides IK, retargeting, animated GLB production, water or a finished authored village. These require concrete skeletons, assets and mobile QA in consuming apps.
