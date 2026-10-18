# 5×5 Arena

Restored original 5×5 Arena branding and visual language, while preserving the Pocket Works standalone Quick PWA and authoritative PocketNet implementation.

Rules: 5×5 battlefield, two fighters at (0,2) and (4,2), five private commands each round, at most four rounds. Moves resolve simultaneously before attacks and shields. Each plan allows a single attack with one or more orthogonal adjacent directions, and a single shield. Attack directions cannot be used as movement directions within the same plan. Repeating a move direction is permitted. In round four, the outer perimeter collapses after the first beat.

Modes: solo against sampled-plan AI (five levels), pass-and-play, authoritative PocketNet duels with pinned v1 server module, private planning, reconnect and durable round replays. Replay scrub, speeds 1×–5×, JSON export, optional WebM export.

Server source: server/module.ts. Immutable copy: pocketnet/module-versions/crossline-5x5/v1.ts. The server validates five actions and expected revision, scores and resolves all combat; viewForPlayer prevents pre-reveal plan leaks.

Check with: node --experimental-strip-types --test apps/crossline-5x5/tests/*.test.mjs
Then npm run registry:check, npm run build:pocketnet, npm run prepare:site, npm run validate:site.

Manual E2E: complete four nonlethal rounds; verify collapse after round-four first beat; test shield and mutual attacks; create/join an online room from two browsers; confirm that B cannot see A's pending actions; refresh browser A after submitting a plan; verify same room/seat/ready flag after reconnection; test replay and exports.

## QA screen gallery (v1.2)

Press **⋯** in the main header, the in-game HUD, or the replay header. On desktop, **Backquote / Ё** also opens the gallery. The isolated same-origin iframe renders 34 deterministic previews using the app's actual DOM screens, rules engine, effects and sound generator. Available groups: main/difficulty/rules, PocketNet lobby and errors, planning and handoff, outcomes, replays, movement/attack/shield/collapse animations, hit/block/fall effects and all seven SFX. Device viewports: phone 390×844, landscape 844×390, desktop 1280×800. Animation speed: 0.25×–4×; replay, theme, and inspector collapse controls available. The **Diagnostics** action switches to the pre-existing Workshop view with FPS, errors, cache and reset actions.

QA frames use synthetic room data and bypass PocketNet connections, identity retrieval, game writes and managed service-worker registration. Live games are not interrupted by opening or leaving the QA gallery. Regression coverage: `tests/dev-gallery.test.mjs` and original `tests/engine.test.mjs`.
