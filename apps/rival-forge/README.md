# RIVAL FORGE 1.2

Mobile-first Marvel Rivals planning tool integrated into Pocket Works.

## Player-aware planning

- Create up to eight player profiles with primary and backup roles, play style, per-hero skill and excluded heroes.
- Assign a concrete player to every controlled slot.
- Recommendations, autocomplete, optimization and team analysis use the assigned player's real hero pool instead of a generic account-wide score.
- Per-player hero skill is edited directly inside each hero sheet.

## Team-Up loadouts

Every selected hero keeps two selectable Season 9 Team-Up abilities. Rival Forge can optimize all choices at once, prefers enhanced options with present partners, and keeps base/enhanced state visible.

## Plan branches and comparison

- Save multiple variants of the current build, including heroes, locks, player assignments and Team-Up choices.
- Saved builds include their variants.
- Select two recommended heroes to compare personal fit, role value, synergy, difficulty and added toolkit.

## Persistence

Local state and JSON exports use `rival-forge/3`. Version 1.2 imports `rival-forge/1`, `rival-forge/2` and `rival-forge/3` files.

## Tests

```bash
node --test apps/rival-forge/tests/core.test.mjs
```
