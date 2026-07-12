# Pocket Works — phased implementation plan

This file turns the broad environment roadmap into small, self-contained implementation phases. Work on one phase at a time. Each phase should end with one coherent commit, one Netlify deploy and one short status update in this document.

## Operating rule

For every phase:

1. Read only `AGENTS.md`, `apps/AGENTS.md`, this file and the files explicitly named by the phase.
2. Do not start work from later phases unless it is required to keep the current phase functional.
3. Keep the existing launcher and published apps working throughout.
4. Finish with validation, a production deploy check and a status update below.
5. Use one commit per phase whenever practical.

Status values: `not-started`, `in-progress`, `blocked`, `done`.

---

## Phase 0 — Baseline and safety net

**Status:** `not-started`

### Goal

Record the current working state and make later refactors safer.

### Scope

- document current launcher and app structure;
- confirm `Screen Lab` remains the reference working app;
- add a lightweight repository health command;
- ensure the validator checks root files as well as registered apps;
- record current production URL and expected paths.

### Main files

- `scripts/validate.mjs`
- `README.md`
- `docs/BASELINE.md`
- `netlify.toml`

### Done when

- `node scripts/validate.mjs` validates the launcher and every registered app;
- the current production site and Screen Lab load successfully;
- later work has a documented rollback/reference point.

---

## Phase 1 — Native-feeling mobile foundation

**Status:** `not-started`

### Goal

Create a small shared mobile runtime that removes browser-like behavior and improves app-like interaction without imposing a shared visual style.

### Scope

- controlled `touch-action` policies;
- disable unwanted text selection, callouts and image dragging on interactive surfaces;
- prevent accidental double-tap zoom where the interaction model requires it;
- prevent input-focus zoom by enforcing mobile-safe input sizing;
- normalize tap highlight behavior;
- handle `pointercancel` and pointer capture helpers;
- provide `visualViewport` keyboard helpers;
- provide safe-area and `100dvh` utilities;
- provide overscroll and scroll-lock helpers for true full-screen apps;
- keep text selectable inside real reading/editing surfaces.

### Main files

- `shared/mobile-runtime.css`
- `shared/mobile-runtime.js`
- `apps/_template/index.html`
- `apps/_template/styles.css`
- `apps/_template/app.js`
- `apps/AGENTS.md`

### Done when

- a newly generated/template app behaves like an app in Safari and standalone mode;
- long-press, double-tap, input focus and orientation do not trigger unwanted browser behavior;
- Screen Lab can adopt the runtime without visual regressions.

---

## Phase 2 — Pocket Forge and generated app metadata

**Status:** `not-started`

### Goal

Make creation of a new application deterministic and difficult to screw up.

### Scope

- add `app.config.json` inside each app;
- create `scripts/new-app.mjs`;
- generate unique manifest IDs, cache names, storage namespaces and paths;
- generate `apps.json` from app configs instead of editing it manually;
- add presets such as `vanilla`, `interactive`, `canvas`, `game-2d` and `audio`;
- make one command create, register and validate an app skeleton.

### Main files

- `scripts/new-app.mjs`
- `scripts/build-registry.mjs`
- `scripts/validate.mjs`
- `apps/_template/app.config.json`
- `apps.json`
- per-app `app.config.json`

### Done when

- a command such as `node scripts/new-app.mjs example --preset=interactive` creates a valid isolated app;
- the registry is generated rather than hand-maintained;
- duplicate slugs, scopes, caches and storage namespaces are rejected.

---

## Phase 3 — Atomic publishing and dependable updates

**Status:** `not-started`

### Goal

Ensure users never receive half-finished files or confusing stale PWA versions.

### Scope

- enforce one coherent commit for a completed app/update;
- add a shared update manager;
- detect a waiting Service Worker;
- display an in-app update prompt;
- support safe refresh after update;
- maintain explicit cache versions and cleanup;
- add per-app changelog/version metadata;
- document rollback behavior.

### Main files

- `shared/update-manager.js`
- `shared/update-manager.css`
- launcher files
- app templates
- `scripts/validate.mjs`

### Done when

- a deployed update is detected inside an installed PWA;
- the user can update deliberately without manually clearing Safari data;
- old caches are removed without touching neighboring apps;
- the launcher displays current app versions.

---

## Phase 4 — Pocket Works launcher upgrade

**Status:** `not-started`

### Goal

Turn the root site into a useful personal application shelf rather than a plain list.

### Scope

- search and filtering;
- favorites;
- recently opened apps;
- app version and last-update metadata;
- offline-ready and experimental indicators;
- distinct previews or cover treatments per app;
- app details panel;
- actions for open, install guidance, clear local data and view changelog;
- preserve the non-generic, non-App-Store visual direction.

### Main files

- root `index.html`
- root `styles.css`
- root `app.js`
- generated `apps.json`
- optional `shared/launcher-storage.js`

### Done when

- the launcher remains fast with dozens of apps;
- recent/favorite state persists locally;
- each app remains visually distinct;
- the launcher is useful in standalone mode and offline.

---

## Phase 5 — Shared capability modules and Workshop Mode

**Status:** `not-started`

### Goal

Expand the creative and technical arsenal without creating a shared visual template.

### Scope

Create small optional modules for:

- motion and gesture primitives;
- storage and migrations;
- data export/import;
- audio activation and lifecycle;
- sensors and permissions;
- fullscreen and orientation;
- debugging and performance measurement;
- Workshop Mode with cache, storage, viewport, FPS, errors and reset tools.

Possible libraries may be introduced only where justified:

- Motion for advanced DOM/SVG motion;
- Dexie for structured IndexedDB data;
- Zod for schema validation;
- Lit for isolated reusable system controls.

### Main files

- `shared/motion/`
- `shared/input/`
- `shared/storage/`
- `shared/export/`
- `shared/audio/`
- `shared/sensors/`
- `shared/debug/`

### Done when

- modules are opt-in and tree/locality friendly;
- apps do not inherit a common visual appearance;
- Workshop Mode can be enabled per app without shipping intrusive debug UI by default.

---

## Phase 6 — Enhanced application templates

**Status:** `not-started`

### Goal

Support larger applications and games without forcing build tooling onto small experiments.

### Scope

Maintain two paths:

### Quick PWA

- plain HTML, CSS and JavaScript;
- no build step;
- minimal dependency surface.

### Enhanced PWA

- Vite;
- TypeScript;
- `vite-plugin-pwa`/Workbox;
- optional Vitest;
- proper asset bundling and code splitting.

Add specialized presets:

- PixiJS visual/canvas app;
- Phaser 2D game;
- Tone.js audio app.

### Main files

- `templates/quick/`
- `templates/enhanced/`
- `templates/pixi/`
- `templates/phaser/`
- `templates/tone/`
- root package/build configuration as needed.

### Done when

- Pocket Forge can create either a Quick or Enhanced app;
- Netlify builds both correctly;
- heavy dependencies are limited to apps that need them;
- offline behavior remains valid after bundling.

---

## Phase 7 — Automated quality gates

**Status:** `not-started`

### Goal

Catch broken controls, viewport regressions and PWA failures before production.

### Scope

- Vitest for pure logic and migrations;
- Playwright smoke tests for Chromium and WebKit mobile profiles;
- portrait and landscape checks;
- console-error detection;
- manifest and Service Worker checks;
- screenshot regression coverage for critical screens;
- Lighthouse CI performance/accessibility budgets;
- deploy-blocking validation for serious failures.

### Main files

- `tests/`
- `playwright.config.*`
- `vitest.config.*`
- Lighthouse configuration
- GitHub Actions workflows
- `netlify.toml`

### Done when

- each registered app receives a basic automated smoke test;
- broken main interactions prevent deployment;
- reports identify the exact app and failure;
- Screen Lab acts as the first complete test fixture.

---

## Recommended execution order

Implement strictly in this order:

1. Phase 0 — baseline;
2. Phase 1 — native mobile foundation;
3. Phase 2 — Pocket Forge and generated metadata;
4. Phase 3 — update lifecycle and atomic publishing;
5. Phase 4 — launcher upgrade;
6. Phase 5 — shared capabilities and Workshop Mode;
7. Phase 6 — enhanced templates and optional libraries;
8. Phase 7 — automated quality gates.

Phases 0–3 form the platform foundation. New experimental apps can continue to be added after Phase 1, but large launcher or library work should wait until the foundation is stable.

## Per-phase context packet

At the start of a phase, only load:

- the phase section from this document;
- `AGENTS.md`;
- `apps/AGENTS.md`;
- the files listed under that phase;
- the current status of the preceding phase.

Do not reload the entire repository or the full environment roadmap unless a concrete dependency requires it.

## Completion log

Update this section after each phase.

| Phase | Status | Commit | Production check | Notes |
|---|---|---|---|---|
| 0 | not-started | — | — | — |
| 1 | not-started | — | — | — |
| 2 | not-started | — | — | — |
| 3 | not-started | — | — | — |
| 4 | not-started | — | — | — |
| 5 | not-started | — | — | — |
| 6 | not-started | — | — | — |
| 7 | not-started | — | — | — |
