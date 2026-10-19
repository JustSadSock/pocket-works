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

2026-10-19 — 0.3.0 Combat Forge + first external game integration (pushed to main):
- New pure deterministic 2D combat simulator with 3 arenas, 6 real abilities, 4 loadouts, team sizes 1×1/2×2, projectiles, hazards, resource/cooldown mechanics.
- Combat Worker uses seed-paired evolutionary comparisons, side swapping and new-seed evaluation; exports replay frames and a learned 8-gene policy. V8 test: 7 iterations, 2 accepted mutations, valid checkpoint/replay, holdout score improved in that sample (not a guarantee).
- Added fully interactive combat station (fight, pause, step, 1×/3× replay, evolve, stop, evaluate, save/load) and separate Shpilka station with training and saved policies.
- Shpilka 2.9.1 Petri-only iframe bridge loads original physics code, overrides controls in isolation, drives actual updateSimulation and compares sampled 9-parameter driving policies; standard game frame loop stays unchanged outside the iframe.
- Station files precached in Petri 0.3 SW; Shpilka bridge precached in Shpilka 2.9.1 SW; metadata updated and tests added.
- 6 deterministic arena/team test scenarios passed in isolated V8. Combat worker 7-generation cycle and holdout test passed. Test files for Node and browser committed. **Actual Playwright/visual runs, Shpilka live browser verification, and high-speed Shpilka parity/performance benchmark remain unverified**. No claim of production visual acceptance.

Next: resolve live-browser regressions, measure Shpilka parity/performance on real engine, then expand Combat Forge editor and add Perekos adapter.


2026-10-19 — **PetriForge 0.4.0 / Combat Forge Studio**, merged into main:
- Combat rule schema: elimination, point capture, damage-score race; adjustable match timer and winning score; two teams with independent HP/speed/energy regen and six meaningful configurable skill strengths.
- Paint custom 60×60 cover, damaging circles and capture point directly onto the battle canvas; erase, undo/redo, presets, local named maps, JSON export/import, validation and spawn protection. Training locks editing to prevent nonstationary configurations.
- Physics and replay both use real rules. Aim/pathing adapts to capture point; capture gives points only when uncontested. Replay snapshots preserve map objects, dynamic barriers, zone damage, capture objective and custom maximum HP.
- Worker evaluation carries rules to every training, tournament and test episode and reverses team stats when sides swap.
- Added environment adapter over original Perekos core with reset/observe/step/checkpoint API, seed, bounded input and restricted observations. **Perekos mode is not yet accessible in the UI**.
- V8 checks executed: six combinations (3 combat modes × 1v1/2v2) deterministic with valid replay; learning Worker completed 6 generations with 4 accepted mutations and produced a checkpoint and a tournament on user-made control arena. Also evaluated the actual Perekos module graph in a standalone V8 harness: 86 live ticks, deterministic controls and replayable snapshots, hidden opponent runes omitted. Added Node and Playwright regression test files. **Deployed browser/real Playwright acceptance and Node suite in the target build are not executed in this chat**.
- Main risk for next iteration: connect Perekos adapter to visible UI; full Shpilka engine parity/performance, WebKit portrait and offline cross-origin Perekos dependencies require browser testing.


2026-10-19 — **PetriForge 0.5.0 / Perekos tactical agents** pushed to main:
- Added fourth lab tab, native portrait arena and replay timeline; renders actual game-state actors, projectiles, walls, shields, rune draft, collapsing ring, current aim and decisions.
- New 14-parameter Perekos tactical policy. Uses actual movement from consecutive public game observations for aim lead; chooses movement, aim, shield, dash and rune offer each tick/round. Includes obstruction-aware navigation around original map barriers.
- Separate Perekos training Worker executes full original fixed-step combat, episodic evaluation, mutation/selection, controlled stop, holdout series, policy tournaments and capped frame capture. Reports draws and truncated matches honestly, never counts them as wins.
- IndexedDB model library, local autosave of successful/stopped training, JSON import/export with version checks; explicit **heuristic** transfer from Combat Forge 8-parameter policies to Perekos 14-parameter policy.
- V8 checks executed with authentic Perekos core and its rune/mage/element dependencies: 8400-step control match and 366 replay frames; Worker training end-to-end (1 and 2 generations) with valid snapshots, policy evaluation and measurable true combat damage. No reliable full-match victories in checked seeds: a remaining training-quality limitation, not a completed universal AI.
- Added Node unit tests for tactical action legality, rune draft and deterministic trajectories; Playwright browser tests for full workflow, mobile rendering and transfer. **Full browser execution and deployed/mobile screenshot verification not run in this conversation.**
- Next: stronger self-play/league, varied curricula, train/test comparison and better win-rate on full matches.


2026-10-19 — **PetriForge 0.6.0 / Training quality and league** pushed to main:
- Agent navigation and firing corrected for original mage projectile velocity/lifetime; closing distance and predictive interception improved without changing Perekos physics.
- New perekos-training.mjs runs actual fixed-step rounds, two-round rune lessons and full matches with true damage/round/match records. No points awarded for draws.
- Curriculum now includes dummy, charger, native built-in bot, aggressive/evasive policies and archived previous models. Evolution uses paired seed/opponent cases; training stage rotates, second rounds draft real runes. Full-match evaluation is held out from training; policy rolls back if independent round holdout clearly regresses.
- UI: three curriculum programs, selectable test rival, learning-curve canvas, round wins/losses/draws and real full-match finish/win rate separately; independent comparison of transfer policy from Combat Forge before replacing a saved brain.
- Verified in V8 with authentic Perekos core: 3 generations completed, 2 candidate mutations accepted during training, league populated, 3 opponent types + league exercised; independent holdout detected regression and original policy restored. A two-round scenario successfully recorded real rune drafting and two authentic wins against the stationary opponent. Test tournament, model comparison, and stopping during training all returned valid results. **No full-match wins against strong opponents were observed in this sample**.
- Added deterministic curriculum/rune/self-play unit test coverage and browser journey updates, but complete Playwright + mobile/WebKit acceptance was not executed here.
- Next: evaluate performance with stronger training curricula and actual full-match win rates instead of relying on proxy fitness.
