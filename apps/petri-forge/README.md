# PetriForge

Port of the recovered Petri-forge cloud build. A 30×20 grid editor with brush, line, rectangle, flood fill, pipette, undo/redo, procedural maps, draggable spawn/goal and a Random or Q-learning agent running in a Worker.

Run from the PocketWorks static server. No external service is required. Scene storage is isolated at `pocket-works:petri-forge:scene`. Explicit Save/Load preserve the authored grid; resetting restarts an episode. Drag the blue start or green goal to relocate it. The environment selector exposes generators on touch devices.

The port retains original learning rules. It fixes fractional indices in room generation, pointer coordinate scaling, out-of-bounds endpoint dragging and unbounded worker request queues. Hidden tabs pause simulation. Network multiplayer is not part of this project.
