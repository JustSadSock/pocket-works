Original prompt: Добавить PetriForge в PocketWorks, сохранив исходные механики.

Recovered cloud source ported; pointer input, scene validation, worker backpressure and mobile layout implemented. Visual and browser acceptance pending.
Chromium and WebKit passed desktop, portrait and landscape: procedural rooms, touch painting, undo/redo, save/reload, Random step, Q-learning run/pause/reset, no overflow, launcher exit, real network-loss offline reload. Playwright WebKit's context.setOffline bypasses Service Workers on this Windows runtime; verified by disconnecting the local HTTP server instead. No new page errors. Screenshots inspected against FOG/ZAMAZKA legacy covers. Root update/mobile validators report unrelated legacy debt and unbuilt Enhanced apps; PetriForge has no findings.

2026-10-19: added [PetriForge roadmap](../../docs/PETRIFORGE-ROADMAP.md). First external agent training target is Shpilka, with a combat duel sandbox in the same major iteration; Перекос is the second integration. This is planning only. Existing Q-learning gameplay unchanged.

2026-10-19 — PetriForge **0.2.0, first implementation stage delivered to main**:
- Pure deterministic lab-core.mjs (6 seeded scenarios, episodic rewards and reset, Q-learning/Random and typed checkpoints).
- Dedicated asynchronous module Worker with train/stop/evaluate, bounded batches, holdout maps, replay samples and training history.
- IndexedDB library, autosave, named checkpoints, JSON import/export with validation and corruption errors.
- Material laboratory UI: world/learning/model panels, learning curve, heatmap, best/worst replay, mobile-first overflow handling. Kept legacy save key and editor.
- Unit tests: deterministic scenarios, reward consumption, terminal behavior, learned Q-table, snapshot, traces and RNG; new Playwright smoke tests added.
- Developer checks performed via independent JS/V8 executions: all six seeded courses improved to 94–100 successes in final 100 training runs after 550 episodes; Q serialization matched; static initialization/toolbar/train dispatch and UI progress received, with corrected keyboard-handler binding. Actual deployed browser / Playwright tests **not executed** in this session.
- **Not shipped:** Shpilka game integration, Combat Forge arenas, Perekos adapter, DQN/PPO. Next stage = Shpilka headless parity + basic combat sandbox.
