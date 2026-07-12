# Pocket Works — phased implementation plan

Work on one phase at a time. Every phase ends with a green health check, one squash commit on `main`, one Netlify production deploy and a user-facing completion report.

## Context rule

At the beginning of a phase, load only:

1. `AGENTS.md`;
2. `apps/AGENTS.md`;
3. the current phase below;
4. the listed reference files;
5. the previous phase result.

Status values: `not-started`, `in-progress`, `blocked`, `done`.

## Phase 0 — Baseline and safety net

**Status:** `done`

Structural validation, shared health command, CI/Netlify checks, rollback baseline and cache ownership protection.

**Reference:** `scripts/validate.mjs`, `docs/BASELINE.md`, `.github/workflows/validate.yml`.

**Result:** `d1458cf525b57e2c3e0fc0714ae0440017089538`; production ready.

## Phase 1 — Native-feeling mobile foundation

**Status:** `done`

Shared viewport, safe-area, keyboard, selection, touch-action, pointer lifecycle, press feedback and scroll-lock behavior without a shared visual style.

**Reference:** `shared/mobile-runtime.*`, `scripts/validate-mobile-runtime.mjs`, app template and Screen Lab.

**Result:** `6a5973c14c9f60faf4493183725a0c40494cbea6`; production ready.

## Phase 2 — Pocket Forge and generated metadata

**Status:** `done`

`app.config.json`, generated registry, isolated identifiers, rollback-safe Forge command and five starter presets with smoke tests.

**Reference:** `scripts/app-config.mjs`, `scripts/build-registry.mjs`, `scripts/new-app.mjs`, `scripts/presets.mjs`.

**Result:** `a155a020ca2d14708a755a0475821b159d90a1c9`; production ready.

## Phase 3 — Atomic publishing and dependable updates

**Status:** `done`

Managed waiting-worker updates, release notes, explicit activation, scoped cache cleanup and documented forward-version rollback.

**Reference:** `shared/update-manager.*`, `scripts/validate-update-contract.mjs`, `docs/PUBLISHING.md`.

**Result:** `ef885f473a6559159e66925c8563cc035f17ebe5`; production ready.

## Phase 4 — Pocket Works launcher upgrade

**Status:** `done`

Implemented:

- search across names, descriptions, mechanics, tags and release notes;
- filters for all, saved, recent, offline-ready and experimental apps;
- persistent favorites, recents, selection and sorting;
- preset-aware seeded previews with restrained ambient motion;
- version, update date, offline cache and last-opened information;
- desktop focus bay and mobile bottom-sheet details;
- release notes and open, save and copy-link actions;
- local registry snapshot fallback for offline use;
- mobile-runtime integration and controlled sheet scroll locking;
- network-first registry refresh with stable cached fallback;
- dedicated `validate:launcher` CI contract.

**Reference:** root `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, `scripts/validate-launcher.mjs`.

**Acceptance:** `npm run health` passes, personal state survives reloads, cached applications are identified, the shelf remains useful offline and mobile details behave as an interruptible sheet.

**Result:** Phase 4 PR passed every CI stage. Final squash SHA and production status are recorded in the completion report.

## Phase 5 — Shared capabilities and Workshop Mode

**Status:** `not-started`

Add opt-in, visually neutral modules for motion, input, storage/migrations, import/export, audio, sensors, fullscreen, orientation and diagnostics. Add Workshop Mode for viewport, FPS, errors, storage, caches and reset tools.

**Reference to load:** `shared/`, app template, Screen Lab.

## Phase 6 — Enhanced application templates

**Status:** `not-started`

Keep Quick PWA and add an optional Vite/TypeScript/Workbox path with Vitest and justified PixiJS, Phaser and Tone.js presets.

**Reference to load:** Pocket Forge, templates, build configuration and Netlify configuration.

## Phase 7 — Automated quality gates

**Status:** `not-started`

Add Vitest, Playwright Chromium/WebKit mobile coverage, portrait/landscape tests, console and Service Worker checks, critical screenshots and Lighthouse budgets.

**Reference to load:** validators, templates, Screen Lab, GitHub workflows and Netlify configuration.

## Completion log

| Phase | Status | Reference | Production |
|---|---|---|---|
| 0 | done | `d1458cf525b57e2c3e0fc0714ae0440017089538` | ready |
| 1 | done | `6a5973c14c9f60faf4493183725a0c40494cbea6` | ready |
| 2 | done | `a155a020ca2d14708a755a0475821b159d90a1c9` | ready |
| 3 | done | `ef885f473a6559159e66925c8563cc035f17ebe5` | ready |
| 4 | done | Phase 4 squash PR | verify after merge |
| 5 | not-started | — | — |
| 6 | not-started | — | — |
| 7 | not-started | — | — |
