# DEAD AIR // 13

Landscape-first Enhanced Pocket Works action game built with Phaser 3.

## Product loop

- Campaign of 13 sequential broadcasts.
- Each stage combines traversal/combat encounters with a multi-phase boss.
- Held FIRE gives the player direct attack timing and facing control, with only a narrow forward aim assist for touch play.
- Local persistence stores unlocked channels, completion, best grades, scores, clear times, deaths, sound preference and post-campaign progress.
- Completed stages can be replayed from the archive; finishing the campaign unlocks an unstable Encore run.

The application intentionally keeps future stage details out of launcher/menu copy until the player unlocks them.

## Controls

### Touch

- Left pad: horizontal movement.
- JUMP: jump; press again in the air near a pink attack to parry it.
- FIRE: hold to shoot in the facing direction; a narrow forward cone gently corrects toward valid targets.
- DASH: short invulnerable burst.
- SPECIAL: spends one signal pip on an area attack / projectile clear.

### Keyboard

- A/D or arrows: move.
- Space/up: jump / aerial parry.
- Z: fire.
- Shift: dash.
- E: special.

## Architecture

- `source/game.ts`: Phaser runtime, stage traversal, encounter gates, enemies, projectiles, parry, specials, boss phases and attack grammars.
- `source/content.ts`: authored 13-stage campaign data and Encore modifiers.
- `source/save.ts`: validated app-local persistence.
- `source/audio.ts`: procedural Web Audio feedback.
- `source/main.ts`: Pocket Works lifecycle, menus, touch controls, archive, results and Workshop integration.
- `source/styles.css`: broadcast-print UI and landscape mobile layout.

No runtime network access or CDN assets are required.

## QA

Run from repository root:

```bash
npm run test --workspace=@pocket-works/dead-air-13
npm run typecheck --workspace=@pocket-works/dead-air-13
npm run build --workspace=@pocket-works/dead-air-13
npm run registry:check
```

For browser sign-off use the repository production-like build and Playwright mobile landscape matrix.
