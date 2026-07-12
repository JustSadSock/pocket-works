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

Implemented:

- retained the dependency-free Quick PWA path and its five existing presets;
- added runtime-aware `app.config.json` metadata and Forge generation;
- added an isolated Enhanced template with Vite, TypeScript, Workbox and Vitest;
- added `vite`, PixiJS, Phaser and Tone.js Enhanced presets with distinct working mechanics;
- added prompt-based Enhanced PWA updates through `virtual:pwa-register`;
- added Workbox `injectManifest`, navigation fallback and app-owned cache cleanup;
- added isolated `.dist` builds followed by safe promotion into each app directory;
- added published-app build, typecheck and Vitest orchestration;
- added separate Quick and Enhanced Forge smoke-test jobs;
- added compact CI diagnostic artifacts for Enhanced preset failures;
- added runtime-aware PWA, mobile, update, capability and metadata validators;
- added clean `dist-site/` production assembly that excludes source, tests and build tooling;
- changed Netlify to publish only the clean assembled site;
- documented runtime selection and Enhanced application development.

**Reference:** `apps/_enhanced-template/`, `scripts/enhanced-presets.mjs`, `scripts/build-enhanced.mjs`, `scripts/test-enhanced.mjs`, `scripts/promote-enhanced-build.mjs`, `scripts/test-enhanced-forge.mjs`, `scripts/validate-enhanced.mjs`, `scripts/prepare-site.mjs`, `docs/ENHANCED-APPS.md`, root package and Netlify configuration.

**Acceptance:** both CI jobs pass; all four Enhanced presets generate, build, typecheck and pass Vitest; Quick presets remain green; production output contains only deployable assets; no CDN runtime dependency is required.

**Result:** Phase 6 PR passed the complete Quick, Enhanced and production-assembly test matrix. Final squash SHA and production status are recorded in the completion report.

## Phase 7 — Automated quality gates

**Status:** `not-started`

Add Playwright Chromium/WebKit mobile coverage, portrait/landscape tests, console and Service Worker checks, critical screenshots and Lighthouse budgets. Vitest already exists for Enhanced application logic.

**Reference to load:** validators, templates, Screen Lab, GitHub workflows and Netlify configuration.

## Completion log

| Phase | Status | Reference | Production |
|---|---|---|---|
| 0 | done | `d1458cf525b57e2c3e0fc0714ae0440017089538` | ready |
| 1 | done | `6a5973c14c9f60faf4493183725a0c40494cbea6` | ready |
| 2 | done | `a155a020ca2d14708a755a0475821b159d90a1c9` | ready |
| 3 | done | `ef885f473a6559159e66925c8563cc035f17ebe5` | ready |
| 4 | done | `f4e5d9f5d9dcf782af8d386cc75b1cd42a35a8ea` | ready |
| 5 | done | `953f6dfc192bfb44a5dbde893f8dc27a236d2a39` | ready |
| 6 | done | Phase 6 squash PR | verify after merge |
| 7 | not-started | — | — |
