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

- `Calm` uses tactical priorities with deliberate variation.
- `Steady` evaluates group health, influence, territory, captures and the opponent's strongest reply.
- `Sharp` also searches the best continuation after that reply and uses a larger time budget.

The search is locally bounded to keep 19×19 play responsive on a phone. It is intended as a competent offline opponent, not a replacement for a full neural Go engine running on a server or desktop GPU.

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

The app shell, engine, tactical search, dead-group analyser, icon and required Pocket Works shared runtime files are cached by `sente-v1.1.0` after the first successful load.
