# RIVALS FIT LAB

Adaptive Marvel Rivals hero-fit profiler for Pocket Works.

## Product loop

1. Twenty broad questions measure thirteen playstyle dimensions: aim dependence, preferred range, mobility, initiative, frontline tolerance, support responsibility, utility, setup, mechanical complexity, tempo, autonomy, burst preference and brawl comfort.
2. Six precision questions are selected dynamically. The engine looks at the current top eight heroes and chooses the unused question that best separates them on under-measured axes.
3. The result ranks all 53 Season 9.5 heroes, explains the strongest matches and largest conflicts, shows the top ten, and gives the best candidate for Vanguard, Duelist and Strategist.

The score intentionally does not include current tier-list strength or win rate. It models how naturally a hero's play requirements fit the player's stated preferences.

## Data snapshot

Roster snapshot: Season 9.5, checked against the August 20, 2026 live patch. The Hood is included as the newest Vanguard. Hero vectors are derived from role baselines, curated kit tags, difficulty and per-hero overrides.

## Persistence and offline

State is stored under `pocket-works:rivals-fit-lab:state:v1`. The app owns the `rivals-fit-lab-v1.0.0` cache prefix and precaches its files plus the existing Pocket Works mobile runtime.

## Tests

```bash
node --test apps/rivals-fit-lab/tests/engine.test.mjs
```
