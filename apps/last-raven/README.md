# ПОСЛЕДНИЙ ВОРОН

Touch-first Enhanced Pocket Works strategy game set in the world of **A Song of Ice and Fire**. It is a non-commercial fan project and is not affiliated with the rights holders.

## Product loop

The player is castellan of a small northern castle for twelve increasingly dangerous days. Each day has three readable beats:

1. **Gate** — a group arrives. Admit them, refuse them, search them or help them.
2. **Raven** — a letter or rumor arrives. Reply, lie, forward it or burn it.
3. **Night** — food and wood are consumed; delayed consequences resolve on later days.

After day twelve, the accumulated state becomes a short automatic siege. Guard count, morale, supplies, faction relations and previous flags all affect the outcome.

## Architecture

- `core.ts` owns deterministic campaign state, event selection, resource validation, delayed consequences and siege math.
- `main.ts` owns Babylon.js presentation, mobile UI, camera direction, procedural audio and persistence.
- The 3D castle is a deliberately compact winter diorama. The world visually reflects food/wood/population and weather rather than drawing decorative charts.
- `window.__AI_TEST_STATE__` exposes a safe gameplay QA surface for Pocket Works automation.
- Namespaced localStorage keeps an unfinished campaign resumable.
- Workbox injectManifest provides app-local offline support.

## Visual premise

Cold blue-grey masonry, dirty snow, faded heraldry and warm windows. The interface uses opaque iron/parchment surfaces instead of glassmorphism. Camera movement is continuous between gate, rookery, night overview and siege overview.

## Controls

All essential actions are explicit touch targets. The player can open the intelligence drawer at any time, mute audio, return to Pocket Works, choose encounter responses and advance from night to dawn.
