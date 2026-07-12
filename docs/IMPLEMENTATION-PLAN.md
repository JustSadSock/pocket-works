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

Opt-in motion, versioned storage, JSON transfer, audio, device APIs and diagnostics; Workshop Mode; Screen Lab 1.3.0 reference integration; dedicated capability validation.

**Reference:** `shared/capabilities/`, `shared/workshop-mode.*`, `scripts/validate-capabilities.mjs`, `docs/SHARED-CAPABILITIES.md`, app template and Screen Lab.

**Result:** `953f6dfc192bfb44a5dbde893f8dc27a236d2a39`; production ready.

## Phase 6 — Enhanced application templates

**Status:** `done`

Retained Quick PWAs and added the isolated Vite, TypeScript, Workbox and Vitest path with Vite, PixiJS, Phaser and Tone.js presets; runtime-aware validators; safe `.dist` promotion; clean `dist-site/` production assembly.

**Reference:** `apps/_enhanced-template/`, Enhanced Forge/build/test scripts, `scripts/validate-enhanced.mjs`, `scripts/prepare-site.mjs`, `docs/ENHANCED-APPS.md`, package and Netlify configuration.

**Result:** `7444d1aaad66dd61ff2eef8a284f14b6c003c671`; production ready.

## Phase 7 — Automated quality gates

**Status:** `done`

Implemented:

- Playwright mobile projects for Chromium Pixel 5 and WebKit iPhone 13 profiles;
- portrait and landscape startup and overflow coverage;
- launcher search, empty-state, details, favorites, persistence and keyboard-flow tests;
- Screen Lab metrics, repeated-tap recovery, Workshop Mode, focus restoration and native-control tests;
- Chromium Service Worker activation, controller and offline reload coverage;
- console error, page error and browser-dialog rejection;
- critical screenshots plus failure screenshots, traces and video artifacts;
- deterministic `dist-site/` preview server;
- Lighthouse audits of launcher and Screen Lab with hard performance, accessibility, best-practice, layout, blocking-time and resource budgets;
- independent `browser-quality` and `lighthouse` CI jobs;
- static validation that protects the test matrix, budgets and browser-discovered product fixes;
- Pocket Works 0.6.0 with interruptible View Transitions, correct mobile detail layering and same-version update suppression;
- Screen Lab 1.3.1 with WebKit viewport containment and a new app-owned cache identity.

**Reference:** `playwright.config.ts`, `tests/e2e/`, `lighthouserc.json`, `scripts/serve-site.mjs`, `scripts/validate-quality-gates.mjs`, `docs/QUALITY-GATES.md`, GitHub workflow, launcher and Screen Lab release files.

**Acceptance:** health, Enhanced preset, Playwright and Lighthouse jobs pass; Chromium and WebKit mobile scenarios stay free of uncaught errors and horizontal overflow; Chromium launcher and Screen Lab reload offline; performance budgets remain within the committed thresholds.

**Result:** Phase 7 PR completed. Final squash SHA and Netlify production status are recorded in the completion report.

## Completion log

| Phase | Status | Reference | Production |
|---|---|---|---|
| 0 | done | `d1458cf525b57e2c3e0fc0714ae0440017089538` | ready |
| 1 | done | `6a5973c14c9f60faf4493183725a0c40494cbea6` | ready |
| 2 | done | `a155a020ca2d14708a755a0475821b159d90a1c9` | ready |
| 3 | done | `ef885f473a6559159e66925c8563cc035f17ebe5` | ready |
| 4 | done | `f4e5d9f5d9dcf782af8d386cc75b1cd42a35a8ea` | ready |
| 5 | done | `953f6dfc192bfb44a5dbde893f8dc27a236d2a39` | ready |
| 6 | done | `7444d1aaad66dd61ff2eef8a284f14b6c003c671` | ready |
| 7 | done | Phase 7 squash PR | verify after merge |
