# Pocket Works — phased implementation plan

This is the execution document for the Pocket Works environment roadmap. Work on one phase at a time. Every phase ends with validation, one squash commit on `main`, one Netlify production deploy and a user-facing status report.

## Context rule

At the start of a phase, load only:

1. `AGENTS.md`;
2. `apps/AGENTS.md`;
3. the current phase section below;
4. the files listed by that phase;
5. the previous phase result.

Do not reload the whole repository or the long environment roadmap unless a concrete dependency requires it.

Status values: `not-started`, `in-progress`, `blocked`, `done`.

---

## Phase 0 — Baseline and safety net

**Status:** `done`

**Goal:** establish a rollback point and prevent structurally broken applications from reaching production.

**Implemented:**

- `npm run health` shared by local work, GitHub Actions and Netlify;
- root launcher and registered-app validation;
- manifest, icon, Service Worker, cache ownership and registry checks;
- documented production baseline and rollback reference;
- Screen Lab fixed so it removes only its own obsolete caches.

**Reference files:**

- `scripts/validate.mjs`
- `package.json`
- `docs/BASELINE.md`
- `.github/workflows/validate.yml`
- `netlify.toml`

**Result:** commit `d1458cf525b57e2c3e0fc0714ae0440017089538`; production `ready`.

---

## Phase 1 — Native-feeling mobile foundation

**Status:** `done`

**Goal:** remove accidental browser behavior without imposing one shared visual style.

**Implemented:**

- shared dynamic viewport, safe-area and keyboard variables;
- scoped selection, callout, tap-highlight and image-drag policies;
- explicit `touch-action` utilities;
- immediate press-state handling;
- pointer capture, release, cancellation and gesture lifecycle helpers;
- stable document scroll locking;
- standalone/browser and keyboard-open runtime state;
- template integration and offline caching;
- Screen Lab reference integration, upgraded to `1.1.0`;
- dedicated mobile-runtime health validation.

**Reference files:**

- `shared/mobile-runtime.css`
- `shared/mobile-runtime.js`
- `scripts/validate-mobile-runtime.mjs`
- `apps/_template/`
- `apps/screen-lab/`
- `apps/AGENTS.md`

**Acceptance:** `npm run health` passes; PR CI passes; Screen Lab keeps its visual identity; Netlify production is `ready`.

---

## Phase 2 — Pocket Forge and generated metadata

**Status:** `not-started`

**Goal:** make creation and registration of new apps deterministic.

**Scope:**

- add `app.config.json` to each app;
- create `scripts/new-app.mjs`;
- create `scripts/build-registry.mjs`;
- generate manifest IDs, paths, cache names and storage namespaces;
- generate `apps.json` instead of editing it manually;
- add `vanilla`, `interactive`, `canvas`, `game-2d` and `audio` presets;
- reject duplicate identifiers.

**Files to load:**

- `scripts/validate.mjs`
- `scripts/validate-mobile-runtime.mjs`
- `apps.json`
- `apps/_template/`
- `apps/screen-lab/`

**Done when:** one command creates, registers and validates a complete isolated app skeleton.

---

## Phase 3 — Atomic publishing and dependable updates

**Status:** `not-started`

**Goal:** prevent half-finished deployments and stale installed PWAs.

**Scope:**

- one coherent commit for each completed app or update;
- shared Service Worker update manager;
- visible update prompt and safe refresh;
- explicit cache versions and scoped cleanup;
- per-app changelog/version metadata;
- documented rollback behavior.

**Files to load:**

- `shared/mobile-runtime.*`
- app template Service Worker and app entry files;
- launcher files;
- validator scripts.

**Done when:** installed apps detect waiting versions and update without manual Safari cache clearing.

---

## Phase 4 — Pocket Works launcher upgrade

**Status:** `not-started`

**Goal:** turn the root launcher into a useful personal application shelf.

**Scope:**

- search, filtering, favorites and recents;
- versions, last-update and offline indicators;
- distinct previews for every app;
- details panel and quick actions;
- local persistence;
- standalone and offline usefulness;
- no generic App Store or SaaS visual direction.

**Files to load:** root `index.html`, `styles.css`, `app.js`, generated registry and launcher Service Worker.

**Done when:** the launcher remains fast and useful with dozens of visually distinct apps.

---

## Phase 5 — Shared capabilities and Workshop Mode

**Status:** `not-started`

**Goal:** expand the technical arsenal without creating a shared visual template.

**Scope:** optional modules for motion, input, storage, migrations, import/export, audio, sensors, fullscreen, orientation and diagnostics. Add Workshop Mode for viewport, FPS, errors, storage, caches and reset tools.

Possible justified libraries: Motion, Dexie, Zod and Lit.

**Files to load:** `shared/`, the template and Screen Lab as the reference fixture.

**Done when:** every module is opt-in, app-local in effect and visually neutral.

---

## Phase 6 — Enhanced application templates

**Status:** `not-started`

**Goal:** support larger apps and games without burdening simple tools.

**Scope:**

- retain Quick PWA with plain HTML/CSS/JS;
- add Enhanced PWA with Vite, TypeScript and Workbox/vite-plugin-pwa;
- optional Vitest;
- PixiJS, Phaser and Tone.js presets;
- Netlify support for both paths;
- offline behavior after bundling.

**Files to load:** Pocket Forge, templates, root build configuration and Netlify configuration.

**Done when:** Pocket Forge can generate either a lightweight or enhanced isolated app.

---

## Phase 7 — Automated quality gates

**Status:** `not-started`

**Goal:** catch broken interaction, viewport and PWA behavior before production.

**Scope:**

- Vitest for logic and migrations;
- Playwright Chromium and WebKit mobile smoke tests;
- portrait and landscape coverage;
- console-error, manifest and Service Worker checks;
- critical screenshot regression tests;
- Lighthouse CI budgets;
- deploy blocking for serious failures.

**Files to load:** validators, templates, Screen Lab, GitHub workflows and Netlify configuration.

**Done when:** every registered app receives a basic automated smoke test and failures identify the exact app and action.

---

## Completion log

| Phase | Status | Reference | Production |
|---|---|---|---|
| 0 | done | `d1458cf525b57e2c3e0fc0714ae0440017089538` | ready |
| 1 | done | Phase 1 squash PR | pending final verification |
| 2 | not-started | — | — |
| 3 | not-started | — | — |
| 4 | not-started | — | — |
| 5 | not-started | — | — |
| 6 | not-started | — | — |
| 7 | not-started | — | — |
