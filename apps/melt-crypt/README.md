# MELT//CRYPT

MELT//CRYPT is a landscape-first Pocket Works first-person melee roguelike built around one rule: **read the body, read the weapon, read the fight**.

The crypt is one coherent dark-red world. Variety comes from an authored procedural grammar rather than new biomes or random hidden abilities. Enemies are assembled from body, locomotion, head, left arm, right arm/weapon, defense and mutation modules. Every combat-relevant visible part has a matching rule: hammers telegraph slow stagger-heavy attacks, long legs dash, chest plates redirect aim, shields block their side, back cores create weak points and death blasts, caster growths create ranged pressure, claws create flurries.

Recent enemy signatures are rejected when they are too similar, so the system prefers genuinely different combinations rather than the same silhouette with different HP.

## Combat

The mobile control surface deliberately stays at three buttons:

- **ATTACK** — tap for the weapon's normal chain; hold for a core-specific heavy attack.
- **DODGE** — directional from movement input; full stick automatically sprints.
- **WEAPON SKILL** — parry, ward, Blood Arc, hook, Ground Rupture, Phase Cut, execution or stagger pulse depending on the generated weapon. Near a chest, shrine, descent gate or dropped weapon this same button becomes the contextual interaction.

Melee weapons are generated from core + working head + handle/reach + secondary part + trait + skill. Those modules change cadence, reach, attack arc, movement during the swing, stagger, recovery, combo length, aim-assist strength and special action rather than only DPS.

Hits use short event-based hit-stop, camera impulse, stagger, knockback, blood shards/decals, haptics and animation interruption. The camera does not constantly shake.

## Procedural vocabulary

The first grammar release contains:

- 6 enemy body types
- 5 locomotion systems
- 8 enemy arm/weapon modules
- 6 defensive modules
- 8 visible mutations
- 6 player weapon cores
- 10 weapon working heads
- 8 weapon skills
- 18 authored room modules inside the same crypt aesthetic

Meta progression expands the generator vocabulary as runs progress. Relics primarily add mechanics such as second projectiles, stagger explosions, execution healing, chain stagger, longer collision-safe dodges, perfect-dodge haste and heavy aftershocks instead of percentage stat bumps.

## Movement and collision

The player uses a swept capsule-style controller with step-height. High-speed movement is subdivided through the same collision path, so sprint, dodge and movement skills cannot tunnel through thin walls. Small low obstacles can be stepped over instead of becoming invisible blockers.

## Persistence

The app stores settings, enemy signatures, weapon signatures, mechanic relics, best floor, generator progression and the current resumable run in `pocket-works:melt-crypt`.

## Build

```bash
npm run build --workspace=@pocket-works/melt-crypt
npm run test --workspace=@pocket-works/melt-crypt
npm run registry:check
```
