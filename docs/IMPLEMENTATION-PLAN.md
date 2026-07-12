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

Search, persistent filters, favorites, recents, procedural previews, release details, offline readiness, mobile details and local registry fallback.

**Reference:** root launcher files and `scripts/validate-launcher.mjs`.

**Result:** `f4e5d9f5d9dcf782af8d386cc75b1cd42a35a8ea`; production ready.

## Phase 5 — Shared capabilities and Workshop Mode

**Status:** `done`

Implemented:

- opt-in motion helpers with reduced-motion handling and hidden-page suspension;
- versioned local storage with migrations, validation, subscriptions and export/import envelopes;
- bounded JSON transfer and clipboard fallback;
- user-gesture-safe procedural audio feedback;
- feature-detected orientation, motion, fullscreen and orientation-lock helpers;
- diagnostics for viewport, FPS, errors, storage, caches, Service Worker and device support;
- Workshop Mode with mobile sheet and desktop console layouts;
- live reports, error capture, report copy/export and app-owned reset tools;
- two-step destructive actions without browser confirm dialogs;
- template and Screen Lab integration with complete offline caching;
- Screen Lab 1.3.0 as the reference capability consumer;
- dedicated `validate:capabilities` CI contract;
- documented shared API and dependency policy.

**Reference:** `shared/capabilities/`, `shared/workshop-mode.*`, `scripts/validate-capabilities.mjs`, `docs/SHARED-CAPABILITIES.md`, app template and Screen Lab.

**Acceptance:** `npm run health` passes; every Forge preset includes an offline Workshop Mode; diagnostics and destructive actions remain app-scoped; Screen Lab uses shared motion, storage and device helpers.

**Result:** Phase 5 branch completed; final squash SHA and production status are recorded in the completion report.

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
| 4 | done | `f4e5d9f5d9dcf782af8d386cc75b1cd42a35a8ea` | ready |
| 5 | done | Phase 5 squash PR | verify after merge |
| 6 | not-started | — | — |
| 7 | not-started | — | — |
