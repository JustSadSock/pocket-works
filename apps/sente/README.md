# SENTE

SENTE is a classical Go application for Pocket Works. Its visual premise is a small physical kaya board rather than a generic mobile game interface.

## Main loop

- Start a 9×9, 13×13 or 19×19 game.
- Play locally against another person or against one of three offline computer opponents.
- Pass twice to enter scoring; SENTE premarks obvious dead groups and the players can correct disputed groups before accepting the result.
- Review completed games move by move or export them as SGF.

## Rules

The local rules engine implements captures, suicide prevention, simple ko, passing, resignation and Chinese area scoring with 6.5 komi. Automatic dead-group marking is deliberately conservative because general life-and-death resolution is not infallible; tapping a group always toggles its dead/alive state before the final count.

## Computer players

SENTE 2.0 no longer attempts to recreate Go strategy with a handcrafted influence formula. Move generation is provided by GNU Go 3.9.1, a mature Go engine with pattern databases and dedicated reading for strings, dragons, eyes, connections, ladders, life-and-death and territory.

- `Ученик` uses a small number of independent engine readings and permits variation among engine-supported alternatives.
- `Клубный` is the default. It combines several readings made with different seeds and board symmetries, then uses consensus.
- `Мастер` uses the widest consensus set and always prefers the most strongly supported move.
- Board symmetries prevent the engine from returning the same symmetric opening every game without injecting arbitrary bad moves.
- Every suggested move is checked again by SENTE's rules engine before it reaches the board.
- GNU Go runs in a dedicated Web Worker, so a long reading cannot freeze touch input or animation.
- A conservative emergency policy exists only for asset or runtime failure; normal games do not use the old heuristic/minimax bot.

## Behavioral audit

`npm run test:sente-ai` loads the exact WebAssembly engine shipped to users and writes `AI_AUDIT.md` and `AI_AUDIT.json`. The build checks tactical captures and rescues, true-eye avoidance, 24 opening probes across all board sizes, and six observed 9×9 games against expansion, contact and self-play opponents. Each observed game records board snapshots every ten moves, pass timing, occupancy, illegal suggestions and dense peaceful moves. Critical failures stop the production build.

The audit report is linked from the in-app menu so the shipped result can be inspected rather than trusted as a release-note claim.

## Third-party engine

The browser core comes from `TristanCacqueray/wasm-gnugo`, pinned to commit `382df5a9b14b62ea451012ec7d2e81c61162e037`. The loader, WebAssembly binary and GNU GPL v3-or-later license are downloaded during the build and verified against pinned Git blob identifiers. `assets/gnugo/SOURCE.txt` and `COPYING.txt` are included in the deployed application.

## Controls

- Touch and hold the board to preview the nearest intersection; release to place the stone.
- The loupe copies and magnifies the actual rendered board around the snapped intersection, including stones and the placement ghost.
- `Pass` hands over the move. Two consecutive passes start scoring.
- `Back one move` undoes one local move or the latest player/AI pair.
- `Field without panels` enters a distraction-free view with an explicit control to restore the interface.

## Persistence

All state is stored under `pocket-works:sente`. The current game is saved after every move. The latest sixteen completed games are stored locally for replay. Workshop Mode can clear only SENTE-owned data.

## Audio and motion

Stone, capture, pass and completion sounds are generated with Web Audio after a user gesture. Sound, vibration, coordinates and motion can be disabled. `prefers-reduced-motion` is respected by CSS and the in-app animation switch.

## Offline

The app shell, local rules engine, GNU Go worker, audited engine assets, audit report, dead-group analyser, icon and required Pocket Works shared runtime files are cached by `sente-v2.0.0` after the first successful load.
