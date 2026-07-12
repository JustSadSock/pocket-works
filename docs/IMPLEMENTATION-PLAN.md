# Pocket Works — phased implementation plan

This is the compact execution document for the Pocket Works environment roadmap. Work on one phase at a time. Every phase ends with validation, one squash commit on `main`, one Netlify production deploy and a user-facing status report.

## Context rule

At the start of a phase, load only:

1. `AGENTS.md`;
2. `apps/AGENTS.md`;
3. the current phase section below;
4. the files listed by that phase;
5. the previous phase result.

Do not reload the full repository or long roadmap unless a concrete dependency requires it.

Status values: `not-started`, `in-progress`, `blocked`, `done`.

---

## Phase 0 — Baseline and safety net

**Status:** `done`

**Goal:** establish a rollback point and prevent structurally broken applications from reaching production.

**Implemented:**

- one `npm run health` command for local work, GitHub Actions and Netlify;
- launcher, app, manifest, icon, Service Worker and cache ownership validation;
- documented production baseline and rollback reference;
- Screen Lab cache cleanup restricted to its own namespace.

**Reference files:** `scripts/validate.mjs`, `package.json`, `docs/BASELINE.md`, `.github/workflows/validate.yml`, `netlify.toml`.

**Result:** commit `d1458cf525b57e2c3e0fc0714ae0440017089538`; production `ready`.

---

## Phase 1 — Native-feeling mobile foundation

**Status:** `done`

**Goal:** remove accidental browser behavior without imposing one shared visual style.

**Implemented:**

- shared dynamic viewport, safe-area and keyboard variables;
- scoped selection, callout, tap-highlight and image-drag policies;
- explicit `touch-action` utilities and immediate press feedback;
- pointer capture, cancellation and gesture lifecycle helpers;
- stable document scroll locking and standalone/browser state;
- template and Screen Lab integration with offline caching;
- dedicated mobile-runtime validation.

**Reference files:** `shared/mobile-runtime.css`, `shared/mobile-runtime.js`, `scripts/validate-mobile-runtime.mjs`, `apps/_template/`, `apps/screen-lab/`, `apps/AGENTS.md`.

**Result:** commit `6a5973c14c9f60faf4493183725a0c40494cbea6`; production `ready`.

---

## Phase 2 — Pocket Forge and generated metadata

**Status:** `done`

**Goal:** make creation and registration of new apps deterministic.

**Implemented:**

- `app.config.json` as the source of truth for every published application;
- generated `apps.json` with stale-registry detection;
- Pocket Forge command with automatic rollback after failed validation;
- generated manifest identity, cache name, storage namespace and SVG icon;
- `vanilla`, `interactive`, `canvas`, `game-2d` and `audio` presets;
- schema, duplicate identifier, config/manifest and config/Service Worker checks;
- CI smoke test that creates, validates and removes all five preset applications;
- separated CI stages so failures identify the exact validation layer.

**Reference files:** `scripts/app-config.mjs`, `scripts/build-registry.mjs`, `scripts/new-app.mjs`, `scripts/presets.mjs`, `scripts/test-forge.mjs`, `scripts/validate-app-configs.mjs`, `apps/_template/`, `apps/screen-lab/app.config.json`.

**Acceptance:** `npm run health` passes; all five presets generate valid isolated PWAs; duplicate slugs, caches and storage namespaces fail; `apps.json` exactly matches generated configs.

**Result:** PR `#3` passed every CI stage. The squash SHA and production deployment are recorded in the user-facing completion report.

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

**Files to load:** `shared/mobile-runtime.*`, template Service Worker and app entry files, launcher files, validators and Phase 2 Forge files.

**Done when:** installed apps detect waiting versions and update without manual Safari cache clearing.

---

## Phase 4 — Pocket Works launcher upgrade

**Status:** `not-started`

**Goal:** turn the launcher into a useful personal application shelf.

**Scope:** search, filters, favorites, recents, versions, last-update and offline indicators, distinct previews, details and quick actions, local persistence and standalone/offline usefulness. Avoid generic App Store and SaaS styling.

**Files to load:** root `index.html`, `styles.css`, `app.js`, generated registry and launcher Service Worker.

**Done when:** the launcher remains fast and useful with dozens of visually distinct apps.

---

## Phase 5 — Shared capabilities and Workshop Mode

**Status:** `not-started`

**Goal:** expand the technical arsenal without creating a shared visual template.

**Scope:** optional modules for motion, input, storage, migrations, import/export, audio, sensors, fullscreen, orientation and diagnostics. Add Workshop Mode for viewport, FPS, errors, storage, caches and reset tools. Possible justified libraries: Motion, Dexie, Zod and Lit.

**Files to load:** `shared/`, the template and Screen Lab as the reference fixture.

**Done when:** every module is opt-in, app-local in effect and visually neutral.

---

## Phase 6 — Enhanced application templates

**Status:** `not-started`

**Goal:** support larger apps and games without burdening simple tools.

**Scope:** retain Quick PWA; add Vite/TypeScript/Workbox Enhanced PWA; optional Vitest; PixiJS, Phaser and Tone.js presets; Netlify and offline support for both paths.

**Files to load:** Pocket Forge, templates, root build configuration and Netlify configuration.

**Done when:** Pocket Forge can generate either a lightweight or enhanced isolated app.

---

## Phase 7 — Automated quality gates

**Status:** `not-started`

**Goal:** catch broken interaction, viewport and PWA behavior before production.

**Scope:** Vitest, Playwright Chromium/WebKit mobile tests, portrait/landscape coverage, console-error and Service Worker checks, critical screenshots, Lighthouse budgets and deploy blocking.

**Files to load:** validators, templates, Screen Lab, GitHub workflows and Netlify configuration.

**Done when:** every registered app receives a basic automated smoke test and failures identify the exact app and action.

---

## Completion log

| Phase | Status | Reference | Production |
|---|---|---|---|
| 0 | done | `d1458cf525b57e2c3e0fc0714ae0440017089538` | ready |
| 1 | done | `6a5973c14c9f60faf4493183725a0c40494cbea6` | ready |
| 2 | done | PR `#3` | verify after squash merge |
| 3 | not-started | — | — |
| 4 | not-started | — | — |
| 5 | not-started | — | — |
| 6 | not-started | — | — |
| 7 | not-started | — | — |
