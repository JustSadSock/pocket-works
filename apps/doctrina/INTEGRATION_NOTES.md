# Integration notes

`ДОКТРИНА` is implemented as an app-owned Pocket Works module, not an embedded external page.

- Launcher identity comes from `app.config.json` and the generated `apps.json` entry.
- `app.js` is the thin adapter for shared mobile runtime, versioned storage and Workshop Mode.
- The game payload is deterministic, local, cached by the app Service Worker and executed in the application origin.
- A persistent shell-back control returns to `../../`.
- The app uses the Pocket Works safe-area, update, reset and diagnostics contracts.

## Validation performed before PR

- Content counts: 15 laws, 12 doctrines, 18 technologies, 41 event templates.
- Determinism check: identical seeds generate identical country, regions and neighbours.
- Simulation smoke: 40 worlds × up to 35 quarters without non-finite state values.
- Payload check: the decompressed local bundle matches the built game source byte-for-byte.
