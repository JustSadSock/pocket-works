# RIVAL FORGE 1.3

Mobile-first Marvel Rivals planning tool integrated into Pocket Works.

## Player-aware planning

Profiles store each player's preferred roles, style, per-hero skill and blocked heroes. Every controlled slot can be assigned to a concrete player, so recommendations and optimization stay realistic for the actual group.

## Match context

The planner now evaluates the selected queue, map profile, attack/defense side and desired pace. Its Match Score combines the original composition analysis with map geometry, side-specific needs and the group's own history.

The curated Season 9 context includes Thebes and the standard Convoy, Convergence and Domination map profiles. Unknown or custom maps remain supported without a forced map modifier.

## Enemy read and counterpicks

Known enemy picks are classified into broad plans: dive, poke, brawl, sustain or setup. Rival Forge recommends responses that still fit the assigned player and current composition, and exposes low-damage replacements rather than generic isolated counters.

## Decision tree and local meta

The live decision tree creates branches for enemy plans, role budgets, map geometry and fallback swaps. Post-match records store result, map, side, team, enemies, comfort and notes. Local win rates use sample-size shrinkage and only apply a limited recommendation bonus; they are not treated as proof that a pick caused the result.

## Persistence

Local state and JSON exports use `rival-forge/4` and include profiles, assignments, variants, match context, enemy picks and match history. Imports remain compatible with `rival-forge/1`, `/2` and `/3`.

## Tests

```bash
node --test apps/rival-forge/tests/core.test.mjs apps/rival-forge/tests/match.test.mjs
```
