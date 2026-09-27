# Последний камень

Standalone landscape mobile castle defense game for PocketWorks. Build modular walls, gates,
towers, archers and buttresses from a finite material budget; withstand twelve escalating waves;
repair and expand the same castle between attacks.

## Architecture

- `source/simulation.ts`: deterministic fixed-step siege model, building economy, weighted flow
  field, damage, campaign persistence and validation. No renderer dependency.
- `source/world.ts`: Babylon scene, procedural architectural kit, camera, picking, soldiers,
  projectiles and short-lived ballistic debris. Debris are visual and cannot change logical paths.
- `source/main.ts`: touch interface, audio, campaign lifecycle, local saves and QA state.
- `source/sw.ts`: isolated PocketWorks offline cache.

The castle state is stored under `pocket-works:last-stone:campaign`. A reload during a siege
returns to construction with the last saved damage so a suspended mobile session stays playable.
The back button routes to the launcher. The app owns only `apps/last-stone/**`.

## Controls

Tap a building tool, then tap a free tile. Drag the scene to orbit and pinch to zoom. Rotate
or reset the camera with visible buttons. Repair and dismantle are tools applied by tapping a
building. The siege controls allow pause and 2× speed.

## Checks

```bash
npm run typecheck --workspace=@pocket-works/last-stone
npm run test --workspace=@pocket-works/last-stone
npm run build --workspace=@pocket-works/last-stone
npm run registry:check
```
