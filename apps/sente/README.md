# SENTE

SENTE is a classical Go application for Pocket Works. Its visual premise is a small physical kaya board rather than a generic mobile game interface.

## Main loop

- Start a 9×9, 13×13 or 19×19 game.
- Play locally against another person or against one of three offline computer personalities.
- Pass twice to enter scoring; SENTE premarks obvious dead groups and the players can correct disputed groups before accepting the result.
- Review completed games move by move or export them as SGF.

## Rules

The engine implements captures, suicide prevention, simple ko, passing, resignation and Chinese area scoring with 6.5 komi. Automatic dead-group marking is deliberately conservative because general life-and-death resolution is not infallible; tapping a group always toggles its dead/alive state before the final count.

## Computer players

The computer uses a Go-specific candidate policy, a persistent player model and selective minimax search. It does not choose a move from statistical playout averages. For each serious candidate it assumes the opponent will find the strongest available reply, then searches the best counter-reply with alpha-beta pruning and iterative deepening.

- The player model measures contact play, aggression, invasions, expansion, local persistence and stone density from recent moves.
- Each game receives a strategic character: territorial, influence-oriented, fighting, invasive or balanced.
- The candidate policy rejects true-eye fills, secure-territory fills, empty triangles and peaceful compact blocks before calculation starts.
- Search considers captures and saves first, but they are no longer accepted blindly; the opponent's strongest tactical refutation is calculated.
- Quiescence search extends unstable leaves through captures, atari and group-saving sequences instead of evaluating a fight halfway through.
- Transposition caching prevents repeated calculation of the same position, while alpha-beta cutoffs remove branches that cannot change the decision.
- `Calm` searches fewer branches and permits wider variation between close results.
- `Steady` is the default: it calculates several alternating replies and varies only inside a narrow score window.
- `Sharp` searches the deepest tree and normally selects the best calculated result directly.

A full exhaustive search of Go is not feasible on a phone because the number of legal continuations grows exponentially. SENTE therefore searches a carefully filtered set of productive whole-board moves and extends local tactical fights more deeply.

## Controls

- Touch and hold the board to preview the nearest intersection; release to place the stone.
- The loupe copies and magnifies the actual rendered board around the snapped intersection, including stones and the placement ghost.
- `Pass` hands over the move. Two consecutive passes start scoring.
- `Back one move` undoes one local move or the latest player/AI pair.
- `Field without panels` enters a distraction-free view with an explicit control to restore the interface.

## Persistence

All state is stored under `pocket-works:sente`. The current game is saved after every move. The latest sixteen completed games are stored locally for replay. The adaptive computer profile and recent opening choices use SENTE-owned keys under the same namespace. Workshop Mode can clear only SENTE-owned data.

## Audio and motion

Stone, capture, pass and completion sounds are generated with Web Audio after a user gesture. Sound, vibration, coordinates and motion can be disabled. `prefers-reduced-motion` is respected by CSS and the in-app animation switch.

## Offline

The app shell, rules engine, adaptive player model, selective minimax module, dead-group analyser, icon and required Pocket Works shared runtime files are cached by `sente-v1.5.0` after the first successful load.
