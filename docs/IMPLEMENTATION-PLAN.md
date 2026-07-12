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

**Result:** commit `a155a020ca2d14708a755a0475821b159d90a1c9`; production `ready`.

---

## Phase 3 — Atomic publishing and dependable updates

**Status:** `done`

**Goal:** prevent half-finished deployments and stale installed PWAs.

**Implemented:**

- visually neutral shared update-manager JavaScript and CSS;
- waiting-worker detection and version/release-note exchange;
- visible **Later** and **Update now** controls;
- explicit activation through `SKIP_WAITING` only after user confirmation;
- safe reload after `controllerchange`;
- periodic, online and resume update checks;
- version, release date and changelog fields in every app config and generated registry;
- generated release metadata in Pocket Forge and Service Workers;
- launcher and Screen Lab reference integration;
- scoped old-cache cleanup after activation;
- dedicated update-contract validation;
- documented atomic release and forward-versioned rollback process.

**Reference files:** `shared/update-manager.js`, `shared/update-manager.css`, `scripts/validate-update-contract.mjs`, `scripts/app-config.mjs`, `scripts/new-app.mjs`, `docs/PUBLISHING.md`, launcher files, `apps/_template/`, `apps/screen-lab/`.

**Acceptance:** `npm run health` passes; generated apps expose managed update metadata; no Service Worker auto-activates during install; launcher and Screen Lab show an update prompt for a waiting version.

**Result:** Phase 3 branch completed; final squash SHA and production verification are recorded in the completion report.

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
| 2 | done | `a155a020ca2d14708a755a0475821b159d90a1c9` | ready |
| 3 | done | Phase 3 squash PR | verify after merge |
| 4 | not-started | — | — |
| 5 | not-started | — | — |
| 6 | not-started | — | — |
| 7 | not-started | — | — |
