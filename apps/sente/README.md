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

The computer uses a hybrid Go policy and Monte Carlo Tree Search. Tactical knowledge proposes sensible moves, while UCT-guided simulations compare many alternating continuations before the final choice.

- The opening policy spreads across available corners and sides instead of extending directly beside every friendly stone.
- Captures and saves from atari are resolved before strategic search.
- The move policy rewards frontier expansion, reductions, cuts and connections, while rejecting true-eye fills and moves inside secure friendly territory.
- `Calm` uses shorter, more varied simulations.
- `Steady` searches a deeper tree with longer tactical rollouts.
- `Sharp` uses the largest search budget and the deepest continuation tree.

This remains a lightweight offline phone engine rather than a neural KataGo-class system, but its decisions are based on sampled future play rather than a single greedy position score.

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

The app shell, rules engine, Monte Carlo search modules, dead-group analyser, icon and required Pocket Works shared runtime files are cached by `sente-v1.3.0` after the first successful load.
