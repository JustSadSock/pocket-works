# Pocket Works

A monorepo for small, installable, offline-first mobile web applications.

Each application lives in `apps/<slug>/`. Its `app.config.json` is the source of truth; `apps.json` is generated for the launcher.

## Production

- Launcher: https://pocket-works.netlify.app/
- Reference app: https://pocket-works.netlify.app/apps/screen-lab/
- Production branch: `main`
- Deployment: Netlify continuous deployment from GitHub

## Personal application shelf

Pocket Works is not a static link index. The root PWA provides search, filters, favorites, recents, procedural previews, release details, offline readiness, a desktop focus bay, mobile detail sheet and local registry fallback.

## Two application runtimes

### Quick PWA

Quick applications remain plain HTML, CSS and JavaScript. They are the default for focused tools, experiments and small games.

```bash
npm run new:app -- signal-board --runtime=quick --preset=interactive --name="Signal Board"
```

Quick presets:

- `vanilla` — focused persistent utility shell;
- `interactive` — pointer capture and direct manipulation;
- `canvas` — responsive high-DPI drawing surface;
- `game-2d` — lightweight animation/game loop;
- `audio` — user-gesture-safe Web Audio starter.

### Enhanced PWA

Enhanced applications use Vite, TypeScript, Workbox and Vitest. Choose this path when a real dependency graph, compilation, unit tests or a specialised engine materially helps the product.

```bash
npm run new:app -- particle-room --runtime=enhanced --preset=pixi --name="Particle Room"
```

Enhanced presets:

- `vite` — typed platform application without an additional engine;
- `pixi` — PixiJS 8 WebGL scene;
- `phaser` — Phaser 3 scene and update loop;
- `tone` — Tone.js scheduled audio instrument.

Enhanced source lives under `source/`. Vite builds deployable `index.html`, `app.js`, `styles.css`, `manifest.webmanifest` and `sw.js` into the app directory. Complete commands and architecture are documented in [`docs/ENHANCED-APPS.md`](./docs/ENHANCED-APPS.md).

## Useful Forge options

```text
--runtime=quick|enhanced
--description="One sentence purpose"
--release-note="Initial user-visible release note"
--accent=#ff4d1f
--background=#10110f
--theme=#10110f
--orientation=portrait|landscape|any
--status=active|experimental
--order=100
```

Pocket Forge creates the directory, starter mechanic, manifest, icon, Service Worker identity, storage namespace, release metadata and `app.config.json`. Enhanced applications are built before registration. A failed generation is rolled back.

## Repository layout

```text
/
├── apps.json
├── package.json
├── netlify.toml
├── scripts/
│   ├── new-app.mjs
│   ├── presets.mjs
│   ├── enhanced-presets.mjs
│   ├── build-enhanced.mjs
│   ├── test-enhanced.mjs
│   └── validate*.mjs
├── shared/
│   ├── mobile-runtime.*
│   ├── update-manager.*
│   ├── enhanced-update-manager.ts
│   ├── workshop-mode.*
│   └── capabilities/
├── docs/
│   ├── BASELINE.md
│   ├── PUBLISHING.md
│   ├── SHARED-CAPABILITIES.md
│   ├── ENHANCED-APPS.md
│   ├── ENVIRONMENT-ROADMAP.md
│   └── IMPLEMENTATION-PLAN.md
└── apps/
    ├── AGENTS.md
    ├── _template/
    ├── _enhanced-template/
    └── <app-slug>/
```

## Shared capabilities and Workshop Mode

The opt-in, visually neutral shared modules provide interruptible animation, versioned local state, JSON transfer, audio feedback, device APIs and diagnostics.

Pocket Forge wires Workshop Mode into generated apps. Open it through the visible **Workshop** control or `Ctrl/Command + Shift + W`. It can export a diagnostics report and clear only data owned by the current app.

The full API and dependency policy are documented in [`docs/SHARED-CAPABILITIES.md`](./docs/SHARED-CAPABILITIES.md).

## Registry

Never edit `apps.json` by hand.

```bash
npm run registry:build
npm run registry:check
```

The registry includes each app's runtime (`quick` or `enhanced`) alongside version, preset, release notes and storage namespace.

## Managed updates

Quick PWAs use `shared/update-manager.js`. Enhanced PWAs use `shared/enhanced-update-manager.ts` with `virtual:pwa-register`. Both paths keep prompt-based updates: a waiting worker does not reload a live session until the user selects **Update now**.

Every release must update version, release date, changelog, cache identity and matching Service Worker metadata. The atomic release and rollback procedure is in [`docs/PUBLISHING.md`](./docs/PUBLISHING.md).

## Build and health

Install the root build toolchain:

```bash
npm install
```

Build and test published Enhanced applications:

```bash
npm run build:enhanced
npm run test:enhanced
```

Run the same complete suite used by GitHub Actions and Netlify:

```bash
npm run health
```

This builds Enhanced apps, validates both runtime contracts, checks PWA scope and metadata, runs TypeScript and Vitest, and smoke-tests all five Quick plus four Enhanced Forge presets.

## Finish an app

1. Read `AGENTS.md` and `apps/AGENTS.md`.
2. Choose Quick or Enhanced based on product complexity rather than prestige.
3. Replace the starter mechanic with the actual product loop.
4. Preserve app identity, cache ownership and storage namespace.
5. Replace the generated icon with a deliberate application symbol.
6. Update version, release date and changelog before publishing.
7. Run `npm run health`.
8. Test offline launch, installation, long-press, repeated taps, input focus, orientation, safe areas, standalone mode, Workshop actions and update activation.

## Product roadmap

The broad evolution is documented in [`docs/ENVIRONMENT-ROADMAP.md`](./docs/ENVIRONMENT-ROADMAP.md). The phased completion log is maintained in [`docs/IMPLEMENTATION-PLAN.md`](./docs/IMPLEMENTATION-PLAN.md).
