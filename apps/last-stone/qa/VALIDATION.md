# Vertical slice validation — 1.1.0

Source base: `fab05be7d385463c995886dc884366da1e9a03bf` (PocketWorks main).
Only `apps/last-stone/**` is changed. Babylon and the existing model/render/input split remain.

Passed: TypeScript, 9 Vitest tests, production Vite/PWA build, global registry validation,
and `git diff --check`.

Passed four real browser scenarios: Chromium/WebKit × 844×390/390×844 with touch enabled.
Each scenario builds a closed 16-section castle through the visible tools and confirmation
panel, survives infantry plus ram, observes damage and a destroyed gate, preserves 83% keep
health, advances to wave two, reconstructs the breach and upgrades a tower. Cancel, invalid
placement, undo, modal dismissal, pause/resume, speed, save/reload and cache-only reload are
covered. WebKit's HTTP server is actually stopped for the final reload.

All four runs recorded zero page/console errors and zero failed app requests. Screenshot
review covered initial, invalid, preview, castle, siege, aftermath and rebuilt states. Readable
controls, text-labelled PocketWorks exit, portrait layout and landscape layout were checked.

`validated-results.json` contains the observed siege FPS samples: Chromium 33–58;
WebKit 46–64. These are headless container measurements with adaptive resolution, **not**
measurements from a physical midrange phone. Original unbatched scene measured 13–18 FPS
in the same environment. Geometry/material batching, static shadow caching, instanced debris,
no MSAA, bounded effect counts and adaptive resolution reduced the measured rendering cost.

Remaining release work: real phone/thermal measurements, longer balance runs across all 12
waves, more authored terrain/character art and animation. Bridges are fixed approach
infrastructure; HP-based structural destruction uses ballistic fragments rather than a
full per-stone rigid-body solver. No external assets or additional paid dependencies.
