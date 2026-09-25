# MELT//CRYPT

MELT//CRYPT is a landscape-first Pocket Works first-person roguelike built around one rule: **nothing in the crypt stays genetically stable**.

Every run generates a connected dungeon and a fresh population of monsters. A monster genome controls body archetype, proportions, palette, eyes, horns, appendages, aura and combat ability. The result is intentionally pixelated rather than block-built: low-resolution rendering, flat-shaded geometry, dithering and hard-edged materials create a 3D pixel-art look without turning the world into oversized cubes.

## Core loop

1. Enter a seeded floor.
2. Explore branching rooms and corridors.
3. Fight procedural monsters and learn their abilities.
4. Open chests, drink suspicious potions, collect relics and oddities.
5. Clear enough of the floor to open the descent gate.
6. Descend; mutation pressure rises and the next floor gets stranger.
7. On death, discoveries and the best floor persist while the run resets.

## Controls

- Touch: left side movement joystick, right side drag to look, FIRE to shoot, FLASK to drink the selected potion, DODGE for a short dash.
- Desktop: WASD, mouse look/pointer lock, left click fire, Q potion, Space dash, Esc pause.

## Visual language

The dungeon uses authored-by-code low-poly forms with small-scale pixel presentation: stone ribs, trim, crystals, fog and emissive accents. Psychedelia comes from animated palette drift, selective bloom-like emissive materials, damage chroma, potion hue warps and mutation auras rather than a generic neon UI.

## Persistence

The app stores settings, discovered monster phenotypes, discovered loot names, best floor and the current resumable run in `pocket-works:melt-crypt`.

## Build

```bash
npm run build --workspace=@pocket-works/melt-crypt
npm run test --workspace=@pocket-works/melt-crypt
npm run registry:check
```
