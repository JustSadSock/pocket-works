# ЗАСТАВА

A portrait, touch-first strategy simulation for the Pocket Works Godot Web runtime.

## Product loop

The player controls the only maintained bridge across a border river. Visitors approach the gate one at a time. There are no abstract decision cards: the person is visible in the diorama and the primary input is a physical lever.

- Drag left and release to close the gate.
- Drag right and release to admit the visitor.
- The gate, bridge and visitor react immediately.
- Effects alter treasury, food, population, guard strength and public trust.
- Hidden systems such as trade, disease and crime influence future outcomes.
- Some choices schedule consequences several days later.
- Every three visitors ends a day; the settlement consumes food, earns trade income and resolves systemic pressure.
- A campaign lasts 60 days and produces a settlement identity from the final world state.

The app is deliberately deterministic enough to save and resume mid-campaign, while visitor order and weather still vary by run.

## Presentation

The game uses an orthographic 3D miniature-diorama composition instead of a conventional card UI.

- Fixed camera keeps the mobile frame art-directable and cheap to render.
- Time of day changes during each shift.
- Rain and snow are authored GPU particle systems.
- The river uses a lightweight vertex-displacement shader.
- Buildings appear physically as population, trade, forge capacity and guard strength grow.
- The visitor is a small procedural skeleton with modular accessories rather than a collection of unrelated animated meshes.
- Important static gatehouse geometry is authored by the app-local Blender Asset Forge in `asset-forge/diorama.py`; runtime geometry provides a complete fallback before CI-generated GLB output exists.
- Dynamic bridge and portcullis pieces remain in Godot so interaction can interrupt and reverse their motion.

## Architecture

`main.gd` owns simulation state, events, persistence and UI.  
`world_builder.gd` owns 3D presentation and never decides gameplay consequences.  
`visitor_actor.gd` owns the modular visitor rig and locomotion.  
`lever.gd` owns direct touch manipulation and emits only a semantic decision.

That split keeps the simulation testable and prevents visual iteration from rewriting gameplay rules.

## Mobile and Pocket Works

- Godot 4.7.2 Compatibility renderer.
- Portrait 585×1266 logical viewport with 390×844 browser override.
- GDScript only; no C#, extensions, CDN or remote runtime.
- Pocket Works owns Web export, Service Worker, offline cache and release metadata.
- Campaign state and sound preference are saved through the namespaced Pocket Works bridge.
- Start, pause and completion surfaces expose a text-labelled **POCKET WORKS** route back to the launcher.
- `PocketWorks.publish_test_state()` exposes the current day, resources, weather and whether a decision is awaiting input for automated browser QA.

## Quality target

The scene favors a stable 60 fps interaction budget over expensive desktop effects. Lighting is one shadowed directional source plus ambient environment light; no real-time GI or planar reflections are required. Repeating background props are low-detail and important architecture receives authored bevels through Blender.

The final Godot Web export is regenerated after Asset Forge output changes.
