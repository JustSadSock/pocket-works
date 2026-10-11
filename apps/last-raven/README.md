# ПОСЛЕДНИЙ ВОРОН

Touch-first Enhanced Pocket Works strategy game set in the world of **A Song of Ice and Fire**. It is a non-commercial fan project and is not affiliated with the rights holders.

## Product loop

The player is castellan of a small northern castle for twelve increasingly dangerous days. Each day has three readable beats:

1. **Gate** — a group arrives. Admit them, refuse them, search them or help them.
2. **Raven** — a letter or rumor arrives. Reply, lie, forward it or burn it.
3. **Night** — food and wood are consumed; delayed consequences resolve on later days.

After day twelve, the accumulated state becomes an interactive siege. The assault pauses at three tactical command windows. Select reinforce (wood), volley (food), sortie (guards), rally (gold), or hold (free). Every command changes the physical battle, and earlier choices affect enemy pressure and fortification strength. Scarcity at the end of winter is a real liability.

## Architecture

- `core.ts` owns deterministic campaign state, non-repeating eligible event selection, resource validation, delayed consequences, tactical order validation and siege math.
- `campaign-events.ts` expands the 10 original encounters with 28 new scenes, including unlockable flag-based follow-ups.
- `main.ts` owns Babylon.js presentation, mobile UI, camera direction, procedural audio and persistence.
- The 3D castle is a compact winter diorama with slate tower roofs, stonework relief, snow-buried firs and a moving siege ram. The world visually reflects food/wood/population and weather rather than drawing decorative charts.
- `window.__AI_TEST_STATE__` exposes a safe gameplay QA surface for Pocket Works automation.
- Namespaced localStorage keeps an unfinished campaign resumable.
- Workbox injectManifest provides app-local offline support.

## Visual premise

Cold blue-grey masonry, dirty snow, faded heraldry and warm windows. The interface uses opaque iron/parchment surfaces instead of glassmorphism. Camera movement is continuous between gate, rookery, night overview and siege overview.

## Controls

All essential actions are explicit touch targets. The player can open the intelligence drawer at any time, mute audio, return to Pocket Works, choose encounter responses and advance from night to dawn.

## Winter remembers · v0.2.0

- 38 authored gate and raven encounters, including multiple conditional returning characters and consequence chains.
- Random eligible scenes no longer repeat within the twelve-day campaign, as long as fresh alternatives are available.
- Three explicit siege stops. During each stop the player issues one tactical order and the simulation resumes.
- Old v0.1.0 saved campaigns migrate in-place; existing saves and relationship history are retained.
- Improved touch targets and readable one-column decisions on narrow mobile screens; enemy ram movement is linked to siege progress.
