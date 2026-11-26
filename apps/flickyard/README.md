# FLICKYARD

Desktop-first aim trainer built for Pocket Works. The range is a mechanical target workshop: ceramic-faced steel plates travel on rails, rotate on impact and shed small metal/enamel fragments.

## Training modes

- **Щелчок / Flick:** static targets, reaction time and first-shot precision.
- **Ведение / Track:** moving target; hold the left mouse button while keeping the reticle on it.
- **Переключение / Switch:** three moving targets, hit the highlighted target before transferring to the next.
- **Реакция / Reflex:** a short target window; expired targets count as misses.
- **Триатлон / Circuit:** 30 seconds each of flick, tracking and switching.

Sessions store local records, personal bests and recent results. Adaptive mode changes target radius in small steps after every eight shots. It does not change mouse sensitivity behind the player's back.

## Controls

- Mouse movement: aim.
- Left mouse button: shoot; hold in Track.
- Escape: release the pointer and pause.
- P: pause/resume.
- R: restart the current drill.
- F: fullscreen.
- The Settings panel controls pointer sensitivity, reticle size, adaptive difficulty, sound and impact effects.

Pointer Lock is requested only after pressing Start. If the browser refuses it, the game falls back to the visible cursor. No external assets or network requests are required.

## Development checks

Run from the repository root:

    node --test apps/flickyard/tests/engine.test.mjs

Universal QA runs the app-owned smoke suites from qa.plan.json. The game stores all records under pocket-works:flickyard and caches only its own files plus Pocket Works runtime dependencies.
