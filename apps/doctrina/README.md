# ДОКТРИНА II · Атлас державы

Touch-first, offline-first medieval political strategy within Pocket Works.

## The game

**1348. Seven lands. One seal.** Choose a foundation of power:

- Crown of Arden: balanced royal authority;
- League of Seven Towns: wealthy merchants, weak central authority;
- Sacred March: grain and clergy, thin military.

Rule for **24 seasons**. Every season, spend two seals on decrees, legislation, research or diplomacy. End the season to collect dues, consume grain, pay the garrison, apply faction resistance and resolve border raids. Every third season a mandatory petition appears; both outcomes have persistent consequences. The campaign ends after 24 seasons or if the crown loses legitimacy and provincial control.

## Play

1. Tap a province directly on the illuminated atlas. It becomes selected and opens a contextual provincial desk.
2. Spend a seal to levy tax, open grain stores, organize fairs, muster militia or hold a court. These adjust unrest, loyalty, wealth, fortifications and faction support.
3. Use **Council** for six institutional laws and six linked medieval technologies. Prerequisites and each law's simulation effects are visible.
4. Use **Foreign Courts** for envoys, gifts or ultimatums. Low relations invite attacks against known frontier regions. Troops, authority, fortifications and research determine the result.
5. Consult **Chronicle** to understand what happened and why.
6. Complete the rule by advancing seasons and responding to petitions. Results are retained on the final screen and in the chronicle.

### Interface and visual language

A parchment and letterpress chancellery, tactile wax-seal action economy, hand-assembled seven-region SVG atlas, direct-touch selection, paper-grain texture, medieval registry typography, opaque iron-bound navigation, tiny procedural sound with a real mute control, accessible map-region labels and reduced-motion support.

Portrait mobile-first and safe-area-aware, with no remote assets or runtime CDN dependencies.

## Architecture

- **core-v2.js** — deterministic, side-effect-free statecraft engine (7 regions, 5 factions, 5 edicts, 6 laws, 6 technologies, 3 foreign courts, 6 rotating petition types, upkeep and raid resolution). All game mutations return typed success/failure objects with actionable feedback.
- **atlas-v2.js** — stateful DOM/SVG UI, modal flow, role/tab navigation, sound, persistence and read-only QA snapshot at `window.__AI_TEST_STATE__`.
- **styles.css** — atlas view and chancellery materials.
- **sw.js** — offline versioned cache with managed updates.

Campaign saves under `pocket-works:doctrina:atlas:v2`. This **does not overwrite or delete** the earlier 0.1 saves in the legacy `pocket-works:doctrina` namespace; those cannot be safely reinterpreted as this radically different medieval campaign.

## Tests

```bash
node --check apps/doctrina/core-v2.js
node --check apps/doctrina/atlas-v2.js
node --check apps/doctrina/sw.js
node --test apps/doctrina/tests/*.test.mjs
npm run registry:check
```

The tests cover seeded determinism, governance actions, financial costs, prerequisites, diplomacy, petition choices, campaign endings and the DOM control flow with an isolated simulated document. Manual validation of real iOS touch/audio/safe-area behavior remains advisable before declaring every device supported.

## Version

2.0.0, 2026-10-11. The prior compressed 0.1 loader is retained in the repository only for archive; the 2.0 entry point no longer loads or depends on its fragile split gzip payload.
