# RIVAL FORGE 1.1

Mobile-first Marvel Rivals planning tool integrated into Pocket Works.

## Planning modes

- **Party in a 6v6 match** — only the user's party is selected. The remaining slots stay unknown, and the analysis measures whether matchmaking allies can still complete a healthy six-player composition.
- **Full composition** — all six exact heroes are planned and evaluated.

## Team-Up loadouts

Season 9 gives each current hero two selectable Team-Up abilities. Rival Forge stores both options, recommends one for the current party, shows the enhancing partner, and distinguishes base and enhanced states. The Hood is marked as a future/unavailable partner where applicable rather than added as a playable hero.

## Persistence

Local state and JSON exports include planner mode, party size, six-slot team data, locked picks, personal ratings, tiers, notes, saved builds and per-hero loadout choices. Version 1.1 imports both `rival-forge/1` and `rival-forge/2` files.

## Tests

```bash
node --test apps/rival-forge/tests/core.test.mjs
```
