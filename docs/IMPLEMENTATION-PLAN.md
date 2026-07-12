# Pocket Works — phased implementation plan

This document turns the environment roadmap into small, self-contained implementation phases. Work on one phase at a time. Each phase should end with one coherent main-branch commit, one Netlify deploy and one status report.

## Operating rule

For every phase:

1. Read only `AGENTS.md`, `apps/AGENTS.md`, this file and the files explicitly named by the phase.
2. Do not begin later-phase work unless required to keep the current phase functional.
3. Keep the launcher and all published apps working.
4. Finish with validation, production verification and a completion-log update.
5. Prefer a branch plus squash merge so `main` receives one coherent phase commit.

Status values: `not-started`, `in-progress`, `blocked`, `done`.

---

## Phase 0 — Baseline and safety net

**Status:** `done`

### Goal

Record the current working state and make later refactors safer.

### Scope

- document the launcher and app structure;
- retain `Screen Lab` as the reference working app;
- add `npm run health` as the repository health command;
- validate root files as well as every registered app;
- validate manifests, icons, Service Worker registration and cache ownership;
- record production URLs, expected paths and a rollback reference;
- prevent one app from deleting caches owned by another app.

### Main files

- `scripts/validate.mjs`
- `package.json`
- `README.md`
- `docs/BASELINE.md`
- `netlify.toml`
- `.github/workflows/validate.yml`
- `apps/screen-lab/sw.js`

### Done when

- `npm run health` validates the launcher and every registered app;
- GitHub validation passes;
- Netlify completes the production build with status `ready`;
- `/` and `/apps/screen-lab/` remain available;
- later work has a documented rollback/reference point.

### Result

The repository now has one health command shared by local development, CI and Netlify. The validator rejects missing launcher/app files, broken manifest paths, missing local icons, duplicate caches, unregistered app directories and unsafe cross-app cache cleanup. `Screen Lab` cache deletion is prefix-scoped.

---

## Phase 1 — Native-feeling mobile foundation

**Status:** `not-started`

### Goal

Create a small shared mobile runtime that removes browser-like behavior without imposing a shared visual style.

### Scope

- controlled `touch-action` policies;
- disable unwanted selection, callouts and image dragging on interactive surfaces;
- prevent accidental double-tap and input-focus zoom;
- normalize tap highlights;
- pointer capture and `pointercancel` helpers;
- `visualViewport` keyboard helpers;
- safe-area, `100dvh`, overscroll and scroll-lock utilities;
- preserve selection in real reading and editing surfaces.

### Main files

- `shared/mobile-runtime.css`
- `shared/mobile-runtime.js`
- `apps/_template/index.html`
- `apps/_template/styles.css`
- `apps/_template/app.js`
- `apps/AGENTS.md`

### Done when

- a template app behaves like installed software in Safari and standalone mode;
- long-press, repeated taps, input focus and orientation do not trigger unwanted browser behavior;
- Screen Lab can adopt the runtime without visual regressions.

---

## Phase 2 — Pocket Forge and generated app metadata

**Status:** `not-started`

### Goal

Make creation of a new application deterministic and difficult to break.

### Scope

- add `app.config.json` inside each app;
- create `scripts/new-app.mjs`;
- generate unique manifest IDs, cache names, storage namespaces and paths;
- generate `apps.json` from app configs;
- add `vanilla`, `interactive`, `canvas`, `game-2d` and `audio` presets.

### Main files

- `scripts/new-app.mjs`
- `scripts/build-registry.mjs`
- `scripts/validate.mjs`
- `apps/_template/app.config.json`
- `apps.json`
- per-app `app.config.json`

### Done when

- one command creates, registers and validates an isolated app;
- the registry is generated rather than hand-maintained;
- duplicate scopes, caches and storage namespaces are rejected.

---

## Phase 3 — Atomic publishing and dependable updates

**Status:** `not-started`

### Goal

Ensure users never receive half-finished files or confusing stale PWA versions.

### Scope

- one coherent commit for each completed app/update;
- shared Service Worker update manager;
- visible waiting-update prompt and safe refresh;
- explicit cache versions and cleanup;
- per-app changelog/version metadata;
- rollback documentation.

### Main files

- `shared/update-manager.js`
- `shared/update-manager.css`
- launcher files
- app templates
- `scripts/validate.mjs`

### Done when

- installed PWAs detect deployed updates;
- users can update without clearing Safari data;
- old caches are removed without touching neighboring apps;
- the launcher displays current app versions.

---

## Phase 4 — Pocket Works launcher upgrade

**Status:** `not-started`

### Goal

Turn the root site into a useful personal application shelf rather than a plain list.

### Scope

- search, filtering and favorites;
- recently opened apps;
- version, last-update and offline-ready indicators;
- distinct previews per app;
- details panel and quick actions;
- preserve a non-generic, non-App-Store visual direction.

### Main files

- root `index.html`
- root `styles.css`
- root `app.js`
- generated `apps.json`
- optional `shared/launcher-storage.js`

### Done when

- the launcher remains fast with dozens of apps;
- recent and favorite state persists locally;
- each app remains visually distinct;
- the launcher is useful in standalone mode and offline.

---

## Phase 5 — Shared capability modules and Workshop Mode

**Status:** `not-started`

### Goal

Expand the creative and technical arsenal without creating a shared visual template.

### Scope

Optional modules for:

- motion and gestures;
- storage and migrations;
- export/import;
- audio lifecycle;
- sensors and permissions;
- fullscreen and orientation;
- debugging and performance;
- Workshop Mode with cache, storage, viewport, FPS, errors and reset tools.

Libraries may be introduced only where justified: Motion, Dexie, Zod and Lit.

### Main files

- `shared/motion/`
- `shared/input/`
- `shared/storage/`
- `shared/export/`
- `shared/audio/`
- `shared/sensors/`
- `shared/debug/`

### Done when

- modules are opt-in and locality-friendly;
- apps do not inherit a common visual appearance;
- Workshop Mode can be enabled per app without intrusive production UI.

---

## Phase 6 — Enhanced application templates

**Status:** `not-started`

### Goal

Support larger applications and games without forcing build tooling onto small experiments.

### Quick PWA

- plain HTML, CSS and JavaScript;
- no build step;
- minimal dependency surface.

### Enhanced PWA

- Vite and TypeScript;
- `vite-plugin-pwa`/Workbox;
- optional Vitest;
- asset bundling and code splitting.

Specialized presets: PixiJS, Phaser and Tone.js.

### Main files

- `templates/quick/`
- `templates/enhanced/`
- `templates/pixi/`
- `templates/phaser/`
- `templates/tone/`
- root build configuration as needed.

### Done when

- Pocket Forge creates Quick and Enhanced apps;
- Netlify builds both correctly;
- heavy dependencies remain app-local;
- bundled apps retain valid offline behavior.

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
- screenshot regression coverage;
- Lighthouse CI budgets;
- deploy-blocking validation for serious failures.

### Main files

- `tests/`
- `playwright.config.*`
- `vitest.config.*`
- Lighthouse configuration
- GitHub Actions workflows
- `netlify.toml`

### Done when

- each registered app receives a smoke test;
- broken main interactions prevent deployment;
- reports identify the exact app and failure;
- Screen Lab serves as the first complete fixture.

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

Phases 0–3 form the platform foundation. Experimental apps can continue after Phase 1, but large launcher or library work should wait until the foundation is stable.

## Per-phase context packet

At the start of a phase, load only:

- that phase section;
- `AGENTS.md`;
- `apps/AGENTS.md`;
- files listed under that phase;
- the preceding phase result.

Do not reload the entire repository or full roadmap unless a concrete dependency requires it.

## Completion log

| Phase | Status | Commit | Production check | Notes |
|---|---|---|---|---|
| 0 | done | phase-0 squash commit | Netlify `ready` required | Baseline, health command, root/app validation and cache ownership guard |
| 1 | not-started | — | — | — |
| 2 | not-started | — | — | — |
| 3 | not-started | — | — | — |
| 4 | not-started | — | — | — |
| 5 | not-started | — | — | — |
| 6 | not-started | — | — | — |
| 7 | not-started | — | — | — |
