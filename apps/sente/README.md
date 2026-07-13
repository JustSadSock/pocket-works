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

The computer uses a Go-specific move policy, a persistent player model and Monte Carlo Tree Search. Tactical knowledge proposes legal productive moves, while UCT-guided simulations compare alternating continuations before the final choice.

- The player model measures contact play, aggression, invasions, expansion, local persistence and stone density from recent moves.
- Each game receives a strategic character: territorial, influence-oriented, fighting, invasive or balanced.
- The computer adapts that character to the opponent and to whether it is ahead or behind.
- Root search receives controlled diversity, but the final move is sampled only from candidates inside a strict quality window.
- Recent opening choices are remembered so repeated games do not begin with the same response every time.
- Captures and saves from atari are resolved before strategic search.
- Empty triangles, compact peaceful blocks, true-eye fills and moves inside secure friendly territory are rejected before entering the search tree.
- A peaceful adjacent move must produce measurable frontier expansion, reduction or connection; merely adding another friendly stone is not considered progress.
- `Calm` uses shorter and more varied simulations.
- `Steady` uses a materially deeper search and remains the default human-like opponent.
- `Sharp` uses the largest search budget and the narrowest quality window.

This remains a lightweight offline phone engine rather than a neural KataGo-class system, but it no longer relies on raw group size or liberties as a positive strategic reward.

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

The app shell, rules engine, adaptive player model, Monte Carlo search modules, dead-group analyser, icon and required Pocket Works shared runtime files are cached by `sente-v1.4.0` after the first successful load.
