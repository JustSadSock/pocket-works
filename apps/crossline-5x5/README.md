# 5×5 Arena

Restored original 5×5 Arena branding and visual language, while preserving the Pocket Works standalone Quick PWA and authoritative PocketNet implementation.

Rules: 5×5 battlefield, two fighters at (0,2) and (4,2), five private commands each round, at most four rounds. Moves resolve simultaneously before attacks and shields. Each plan allows a single attack with one or more orthogonal adjacent directions, and a single shield. Attack directions cannot be used as movement directions within the same plan. Repeating a move direction is permitted. In round four, the outer perimeter collapses after the first beat.

Modes: solo against sampled-plan AI (five levels), pass-and-play, authoritative PocketNet duels with pinned v1/v2 server modules, private planning, reconnect and durable round replays. Replay scrub, speeds 1×–5×, JSON export, optional WebM export.

Server source: server/module.ts. Immutable snapshots: pocketnet/module-versions/crossline-5x5/v1.ts (existing rooms), v2.ts (new rooms). The server validates five actions and expected revision, scores and resolves all combat; viewForPlayer prevents pre-reveal plan leaks.

Check with: node --experimental-strip-types --test apps/crossline-5x5/tests/*.test.mjs
Then npm run registry:check, npm run build:pocketnet, npm run prepare:site, npm run validate:site.

Manual E2E: complete four nonlethal rounds; verify collapse after round-four first beat; test shield and mutual attacks; create/join an online room from two browsers; confirm that B cannot see A's pending actions; refresh browser A after submitting a plan; verify same room/seat/ready flag after reconnection; test replay and exports.

## QA screen gallery (v1.2)

Press **⋯** in the main header, the in-game HUD, or the replay header. On desktop, **Backquote / Ё** also opens the gallery. The isolated same-origin iframe renders 37 deterministic previews using the app's actual DOM screens, rules engine, effects and sound generator. Available groups: main/difficulty/rules, PocketNet lobby and errors, planning and handoff, outcomes, replays, movement/attack/shield/collapse animations, hit/block/fall effects and all seven SFX. Device viewports: phone 390×844, landscape 844×390, desktop 1280×800. Animation speed: 0.25×–4×; replay, theme, and inspector collapse controls available. The **Diagnostics** action switches to the pre-existing Workshop view with FPS, errors, cache and reset actions.

QA frames use synthetic room data and bypass PocketNet connections, identity retrieval, game writes and managed service-worker registration. Live games are not interrupted by opening or leaving the QA gallery. Regression coverage: `tests/dev-gallery.test.mjs` and original `tests/engine.test.mjs`.

## Development roadmap / v1.3.0

See [docs/ROADMAP.md](docs/ROADMAP.md) for priorities, acceptance criteria, release stages 1–6 and known risks. Stage 1 delivers fair difficulty-scaled AI, durable scoped PocketNet credentials, authoritative v2 match forfeits, v1 backward compatibility, saved offline drafts and private hotseat handoffs. Run `node --experimental-strip-types --test apps/crossline-5x5/tests/*.test.mjs` to include `tests/reliability.test.mjs`. Test two real logged-in PocketNet clients before claiming production validation.

## Animation and effects (v1.4.0)

`combat-visuals.js` is the single event-sourced renderer for the live 5×5 board, interactive replay and 30-fps WebM. It retains 25 cell and 2 fighter elements, uses interpolation for movement, telegraphed orthogonal attack zones, shield pulses, hits, falls using `event.at`, and perimeter collapse. Sound is emitted at the relevant event phase; the combat clock obeys QA animation speeds. `▶` / `⏭` in the top menu toggles motion, and `prefers-reduced-motion` is respected. Neither renderer nor exporter recomputes game outcomes.

Tests: `node --experimental-strip-types --test apps/crossline-5x5/tests/*.test.mjs`, including `tests/combat-visuals.test.mjs`. The full roadmap is `docs/ROADMAP.md`.

## Interactive command planning (v1.5.0)

The five slots are interactive buttons. Tap one to replace that command, or use the compact step toolbar to swap with the preceding/following command, remove it, or exit editing. No other slot is discarded and invalid edits fail atomically with a concrete message. On desktop, number keys 1–5 select the corresponding step. The client projects movement, attack zones, shield positions, repeated-cell visits and round-four edge collapse; risk warnings describe an actual projected fall, not a guessed hit. The server still validates the full five-command plan.

`planning.js` contains the pure partial-plan editor and projection; `tests/planning.test.mjs` covers replacement, command conflicts, swap, repeated visits, collapse and SVG stop markers. QA gallery now includes 37 scenes: route, selected edit and danger scenarios were added.

## Complete replay review and match history (v1.6.0)

The main menu includes **Архив дуэлей**, a bounded, locally persisted collection of up to 24 completed matches. Each record is an immutable copy of the authoritative match log and preserves the revealed A/B plans, all frame states, results and a short title. The archive supports viewing, complete JSON export and confirmed deletion. An explicit forfeit with no executed rounds stays exportable; it does not create a fake replay. Local unfinished matches are not overwritten when opening an archived game. If quota is exceeded, older entries are pruned before the app reports failure.

The replay screen shows both players' complete orders in two five-step rows, highlights the current executed beat and compares the projected private-command movement with the actual grid cell. Individual beat buttons, previous/next controls, keyboard arrows and the scrubber share the same renderer. The predicted movement omits unobservable opponent commands and does not mislabel expected attacks as hits. **JSON** exports the entire match, while **WebM** now renders *all recorded rounds*, regardless of the round currently selected in the viewer. The archive tests are in `tests/replay-archive.test.mjs` and `qa/archive.spec.js`. Three additional isolated QA scenes cover populated/empty history and dual-plan review (40 total).
