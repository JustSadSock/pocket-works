# КРЯЖ

An original, mobile-first voxel survival sandbox for Pocket Works.

## Product loop

Create a seeded world, spawn into gradually blended terrain, gather wood, craft planks and a bench, make tools, mine stone and ore, build, cook food, survive night creatures, die and recover dropped gear, then save and continue later.

## Rendering

КРЯЖ uses a custom software voxel raycaster rather than one scene object per block. Chunks are 16×16×48 typed arrays, generated progressively in short frame budgets. Each screen ray stops at its first opaque surface, naturally removing hidden faces. Internal resolution scales dynamically to protect mobile frame time.

## Controls

- Touch: left joystick, right-side swipe look, hold the view or mining button to break, tap the view or use button to place/use, jump and crouch buttons, direct hotbar selection.
- Desktop: WASD, pointer-lock mouse look, Space, Shift, left/right click, E, Esc, number keys and wheel.

## Persistence

World records are stored in `IndexedDB` under `pocket-works-kryazh-v1`, including deterministic seed, block modifications, functional blocks, player state, inventory, equipment, time, weather, creatures and active kiln jobs. Worlds can be duplicated, exported and imported.

## Originality

No Minecraft name, logo, texture, sound, model, UI artwork, source code, proprietary asset or world-generation data is used. Visual materials, creature names, procedural generation, renderer, interface and synthesized audio are original to this app.
