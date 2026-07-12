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

The computer now evaluates play using territory efficiency rather than rewarding the raw number of stones on the board. Empty points that are surrounded or plausibly controlled are valuable; placing another stone inside an already secure area reduces that value.

- `Calm` uses the same territorial model with a small search budget and deliberate variation.
- `Steady` prioritizes captures, saves groups in atari, attacks weak groups and checks the opponent's strongest reply.
- `Sharp` also searches a continuation after that reply and uses a larger time budget.

Moves that fill a true eye or secure friendly territory are rejected unless they capture stones or save a threatened group. Once no useful contested points remain, the computer passes instead of filling the board. The search remains locally bounded to keep 19×19 play responsive on a phone; it is not a replacement for KataGo or another neural engine running with a model and substantially more memory.

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

The app shell, engine, territorial search, dead-group analyser, icon and required Pocket Works shared runtime files are cached by `sente-v1.2.0` after the first successful load.
