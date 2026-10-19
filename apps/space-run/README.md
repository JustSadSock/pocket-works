# Space Run

Original modular spaceship co-op, ship expansion, inventory/shop, repair minigames, module seats, combat waves and authored asset set retained. PocketNet runs the original authoritative engine with persistent player Maps and hull Sets. Offline solo practice uses the same module and isolated saved state. Explicit create/join room actions replace implicit shared server rooms. Touch controls cover movement, shield, firing, repair hold and module rotation.

## 0.1.1 — Reliability pass

New repair console for repair stations (sequence, timing, circuit), target switching and touch actions. Offline practice validates and flushes saves; touch fire can select the closest enemy until manually aimed. Occupied seats are disabled; keyboard shortcuts do not hijack form inputs. Building previews show invalid placement and keep the selection for retry. Service-worker install caches base assets, while optional sprite variants are cached when visited.

QA: `node --test apps/space-run/qa/reliability.test.mjs`. The complete implementation plan is in [ROADMAP.md](./ROADMAP.md). Live PocketNet multiplayer regression and full mobile/browser visual inspection are still required.
