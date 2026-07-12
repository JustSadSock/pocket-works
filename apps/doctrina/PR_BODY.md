# Summary

Adds `ДОКТРИНА` as a native Pocket Works application under `apps/doctrina/`.

## What changed

- Added procedural statecraft simulation with laws, doctrines, conditional technologies, factions, diplomacy and war.
- Added portrait-first atlas interface, app icon, manifest and app-owned offline Service Worker.
- Integrated shared mobile runtime, versioned storage, managed updates and Workshop Mode.
- Registered the application in the generated launcher registry.
- Added Playwright coverage for the primary quarter loop, persistence, Workshop diagnostics and payload integrity.

## Validation

- 15 laws, 12 doctrines, 18 technologies and 41 event templates.
- Deterministic seed generation verified.
- 40 simulated worlds across up to 35 quarters without non-finite state.
- Compressed game payload restores successfully and exposes the Pocket Works integration API.
