# MELT//CRYPT

MELT//CRYPT is a landscape-first Pocket Works first-person melee roguelike. Version 3.0 rebuilds the game around combat feel first: a fast authored starter weapon, staged encounters, readable enemies, strong animation/sound feedback, and procedural variety layered on top of that foundation.

## Combat Rebuild

The run always begins with **GRAVE CLEAVER**, a hand-tuned three-hit weapon instead of a random starter roll. Its light chain is deliberately fast, hold produces a heavier committed strike, dodge direction comes from movement, and the third button is the current weapon skill.

Every weapon core has an authored motion package with separate anticipation, acceleration, impact, follow-through and recovery. Generated cadence still affects feel, but ordinary attacks are bounded so a bad roll cannot become sluggish.

Player feedback includes visible hands, weapon motion, hit-stop, directional impact FX, event-only camera impulse, stagger, knockback, blood shards/decals, haptics, footsteps and layered procedural audio for swing, flesh, armor, parry, stagger and death.

## Encounters

Combat rooms physically seal after entry. An encounter director controls short waves instead of spawning the whole room at once, changes the audio state and opens the exits after the encounter.

The first combat room on floor one is an authored onboarding beat: three single-enemy waves, then a guaranteed choice between three generated weapons. Every chest also offers three weapons, and ordinary weapon drops are substantially more common.

Dropped weapons have a tall visual beacon and the context prompt compares speed, reach and stagger before pickup.

## Enemies

The grammar still provides six body types, five locomotion systems and eight primary weapon/arm modules, but each creature now presents a simpler visual sentence:

**silhouette + main weapon + one dominant special feature**

The special feature may be a head rule, defense or mutation. This prevents a small mobile silhouette from communicating five unrelated mechanics at once.

Enemy motion uses locomotion and attack packages rather than root-object pulsing. Attacks have anticipation and follow-through, stagger interrupts the current action, and finishing blows retain the creature for a death motion such as knockdown, launch, slam, spin or execution.

## World and readability

The game remains one dark-red crypt. It now contains **26 authored room modules** with different combat compositions: arenas, lanes, pillars, bridges, steps, cages, galleries, arches, execution rings and other set-pieces.

The lighting pass separates value instead of increasing saturation: nearby stone is readable, creature bodies sit above the background, and strong emissive is reserved for important tells, weak points and loot.

During combat the HUD shows only what matters. Generator telemetry is removed, the map fades out, and weapon names only appear briefly after a swap.

## Controls

- **ATTACK** — tap for the chain; hold for the weapon-specific heavy.
- **DODGE** — uses movement direction; strong stick input auto-sprints.
- **WEAPON SKILL** — the generated weapon action, or contextual EQUIP / OPEN / TOUCH / DESCEND when appropriate.

Desktop: WASD, mouse look, LMB attack/hold, E/F skill, Space dodge, Esc pause.

## Persistence

Meta progression, discovered creatures/weapons and settings remain stored in `pocket-works:melt-crypt`. Active 2.x runs are intentionally invalidated because their weapon timing and encounter state are incompatible with the Combat Rebuild.

## Build

```bash
npm run build --workspace=@pocket-works/melt-crypt
npm run test --workspace=@pocket-works/melt-crypt
npm run registry:check
```
