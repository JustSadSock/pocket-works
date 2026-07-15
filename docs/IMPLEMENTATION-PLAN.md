# Pocket Works — phased implementation plan

Work on one focused phase at a time. Every phase ends with a coherent pull request, one squash commit on `main`, and a successful Cloudflare production deployment of that exact commit.

## Context rule

At the beginning of a phase, load only:

1. `AGENTS.md`;
2. `apps/AGENTS.md`;
3. the current phase;
4. the listed reference files;
5. the previous phase result.

Status values: `not-started`, `in-progress`, `blocked`, `done`.

## Phase 0 — Baseline and safety net

**Status:** `done`

Structural validation, shared health command, rollback baseline and cache ownership protection.

**Reference:** `scripts/validate.mjs`, `docs/BASELINE.md`, `.github/workflows/validate.yml`.

**Result:** `d1458cf525b57e2c3e0fc0714ae0440017089538`.

## Phase 1 — Native-feeling mobile foundation

**Status:** `done`

Shared viewport, safe-area, keyboard, selection, touch-action, pointer lifecycle, press feedback and scroll-lock behavior without a shared visual style.

**Reference:** `shared/mobile-runtime.*`, `scripts/validate-mobile-runtime.mjs`, app template and Screen Lab.

**Result:** `6a5973c14c9f60faf4493183725a0c40494cbea6`.

## Phase 2 — Pocket Forge and generated metadata

**Status:** `done`

`app.config.json`, generated registry, isolated identifiers, rollback-safe Forge commands and starter presets with smoke tests.

**Reference:** `scripts/app-config.mjs`, `scripts/build-registry.mjs`, `scripts/new-app.mjs`, `scripts/presets.mjs`.

**Result:** `a155a020ca2d14708a755a0475821b159d90a1c9`.

## Phase 3 — Atomic publishing and dependable updates

**Status:** `done`

Managed waiting-worker updates, release notes, explicit activation, scoped cache cleanup and documented forward-version rollback.

**Reference:** `shared/update-manager.*`, `scripts/validate-update-contract.mjs`, `docs/PUBLISHING.md`.

**Result:** `ef885f473a6559159e66925c8563cc035f17ebe5`.

## Phase 4 — Pocket Works launcher upgrade

**Status:** `done`

Search, filters, favorites, recents, procedural previews, release details, offline readiness, mobile details and local registry fallback.

**Reference:** root launcher files and `scripts/validate-launcher.mjs`.

**Result:** `f4e5d9f5d9dcf782af8d386cc75b1cd42a35a8ea`.

## Phase 5 — Shared capabilities and Workshop Mode

**Status:** `done`

Opt-in motion, versioned storage, JSON transfer, audio, device APIs and diagnostics; Workshop Mode; dedicated capability validation.

**Reference:** `shared/capabilities/`, `shared/workshop-mode.*`, `scripts/validate-capabilities.mjs`, `docs/SHARED-CAPABILITIES.md`.

**Result:** `953f6dfc192bfb44a5dbde893f8dc27a236d2a39`.

## Phase 6 — Enhanced application templates

**Status:** `done`

Retained Quick PWAs and added the isolated Vite, TypeScript, Workbox and Vitest path with Vite, PixiJS, Phaser and Tone.js presets; runtime-aware validators; safe `.dist` promotion; clean `dist-site/` assembly.

**Reference:** `apps/_enhanced-template/`, Enhanced Forge/build/test scripts, `scripts/validate-enhanced.mjs`, `scripts/prepare-site.mjs`, `docs/ENHANCED-APPS.md`.

**Result:** `7444d1aaad66dd61ff2eef8a284f14b6c003c671`.

## Phase 7 — Automated quality gates

**Status:** `done`

Implemented:

- Playwright mobile projects for Chromium and WebKit;
- portrait and landscape startup and overflow coverage;
- launcher and application interaction flows;
- Service Worker activation and offline reload coverage;
- console and browser-error rejection;
- deterministic production preview assembly;
- Lighthouse performance, accessibility and resource budgets;
- independent browser-quality and Lighthouse jobs;
- validation protecting the test matrix and committed budgets.

**Reference:** `playwright.config.ts`, `tests/e2e/`, `lighthouserc.json`, `scripts/serve-site.mjs`, `scripts/validate-quality-gates.mjs`, `docs/QUALITY-GATES.md`.

## Phase 8 — Concurrent application delivery

**Status:** `done`

Application registration is derived from app-owned manifests. Application PRs no longer modify a central registry, and CI enforces one app directory per ordinary PR.

**Reference:** `AGENTS.md`, `scripts/build-registry.mjs`, `scripts/validate-change-scope.mjs`, `.github/workflows/validate.yml`.

## Phase 9 — Cloudflare production pipeline

**Status:** `done`

Cloudflare Workers Builds is the sole production host. Every merge to `main` assembles and validates `dist-site/`, then Wrangler publishes those assets to the `pocket-works` Worker.

**Reference:** `wrangler.jsonc`, `docs/HOSTING.md`, `docs/DEPLOYMENT-PIPELINE.md`, `scripts/validate-deploy-pipeline.mjs`.

## Current completion contract

A future phase is complete only when:

1. code and documentation describe the same architecture;
2. app work remains isolated from platform work;
3. generated output is not committed as source;
4. relevant validation is documented and run when infrastructure is available;
5. the PR is squash-merged;
6. Cloudflare publishes the resulting `main` commit.
