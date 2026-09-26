# Pocket Works

A monorepo for small, installable, offline-first mobile web applications.

Each application lives in `apps/<slug>/`. Its `app.config.json` is the source of truth; `dist-site/apps.json` is generated for the launcher during production assembly.

## Production

- Hosting: Cloudflare Workers Builds
- Cloudflare project: `pocket-works`
- Production branch: `main`
- Build command: `npm run deploy:site`
- Deploy command: `npx wrangler deploy --assets ./dist-site/`
- Worker config: [`wrangler.jsonc`](./wrangler.jsonc)
- Hosting details: [`docs/HOSTING.md`](./docs/HOSTING.md)
- Internet multiplayer backend: [`docs/POCKET-SERVER.md`](./docs/POCKET-SERVER.md)

Every squash merge into `main` triggers a Cloudflare production build. The resulting Cloudflare deployment is the only production source of truth.

## Personal application shelf

Pocket Works is not a static link index. The root PWA provides search, filters, favorites, recents, procedural previews, release details, offline readiness, a desktop focus bay, mobile detail sheet and local registry fallback.

## Three application runtimes

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

### Godot Web

Godot applications are text-authored engine projects for games that materially benefit from a full scene graph, skeletal animation, 3D physics, navigation, particles or complex environment composition. Repository agents write the project files directly; the user does not need to open the Godot editor.

```bash
npm run new:app -- colossus-next --runtime=godot --preset=godot-web --orientation=landscape
```

GitHub Actions runs pinned Godot 4.7.2 headlessly, exports HTML + WebAssembly + PCK into `apps/<slug>/web/`, validates the result and commits the generated export back to the feature branch. Cloudflare never installs Godot; production only packages the committed static Web export.

The iOS/browser target uses the Compatibility renderer with threads and extensions disabled. Pocket Works owns PWA metadata, offline caching, managed updates and release fingerprints. Full architecture: [`docs/GODOT-WEB-RUNTIME.md`](./docs/GODOT-WEB-RUNTIME.md).

## Useful Forge options

```text
--runtime=quick|enhanced|godot
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
├── package.json
├── wrangler.jsonc
├── playwright.config.ts
├── lighthouserc.json
├── tests/e2e/
├── scripts/
│   ├── new-app.mjs
│   ├── presets.mjs
│   ├── enhanced-presets.mjs
│   ├── build-enhanced.mjs
│   ├── build-godot.mjs
│   ├── validate-godot.mjs
│   ├── test-enhanced.mjs
│   ├── serve-site.mjs
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
│   ├── HOSTING.md
│   ├── DEPLOYMENT-PIPELINE.md
│   ├── SHARED-CAPABILITIES.md
│   ├── POCKET-LAN.md
│   ├── ENHANCED-APPS.md
│   ├── GODOT-WEB-RUNTIME.md
│   ├── QUALITY-GATES.md
│   ├── ENVIRONMENT-ROADMAP.md
│   └── IMPLEMENTATION-PLAN.md
└── apps/
    ├── AGENTS.md
    ├── _template/
    ├── _enhanced-template/
    ├── _godot-template/
    └── <app-slug>/
```

## Shared capabilities and Workshop Mode

The opt-in, visually neutral shared modules provide interruptible animation, versioned local state, JSON transfer, audio feedback, device APIs and diagnostics.

Pocket Forge wires Workshop Mode into generated apps. Open it through the visible **Workshop** control or `Ctrl/Command + Shift + W`. It can export a diagnostics report and clear only data owned by the current app.

The full API and dependency policy are documented in [`docs/SHARED-CAPABILITIES.md`](./docs/SHARED-CAPABILITIES.md).

## PocketLAN local networking

`shared/capabilities/lan.js` is the shared device-to-device networking contract for local multiplayer, controllers, collaborative tools and similar peer features. It prefers an injected native LAN provider with automatic room discovery, and falls back in a normal PWA to direct WebRTC DataChannels with an offline pairing exchange and no STUN/TURN/signaling server.

Global internet is not required when peers can reach each other on the same local network or hotspot. LAN-enabled apps opt in and cache the module themselves. Architecture, integration examples, UX rules and the physical-network test matrix are documented in [`docs/POCKET-LAN.md`](./docs/POCKET-LAN.md).

## Registry

Never create or edit a root `apps.json` file. Application metadata is discovered from `apps/<slug>/app.config.json`.

```bash
npm run registry:check
npm run prepare:site
```

`registry:check` validates all manifests without mutating the repository. `prepare:site` generates `dist-site/apps.json` together with the deployable production directory.

The generated registry includes each app's runtime (`quick`, `enhanced` or `godot`) alongside version, preset, release notes and storage namespace.

## Managed updates

Quick PWAs use `shared/update-manager.js`. Enhanced PWAs use `shared/enhanced-update-manager.ts` with `virtual:pwa-register`. Both paths keep prompt-based updates: a waiting worker does not reload a live session until the user selects **Update now**.

Every release must update version, release date, changelog, cache identity and matching Service Worker metadata. The atomic release and rollback procedure is in [`docs/PUBLISHING.md`](./docs/PUBLISHING.md).

## Build and health

Install the root toolchain:

```bash
npm install
```

Run the structural, generator and unit-test suite used by GitHub Actions:

```bash
npm run health
```

This builds Enhanced apps, validates all three runtime contracts, checks PWA scope and metadata, runs TypeScript and Vitest, and smoke-tests the Quick and Enhanced Forge presets. Godot source validation is local; the pinned headless export smoke test runs in GitHub Actions.

For production packaging only:

```bash
npm run deploy:site
```

This assembles `dist-site/`, generates the launcher registry and validates the deployable output consumed by Cloudflare.

## Real-browser quality gates

Prepare the production preview and install the browser engines once:

```bash
npm run build:quality-site
npx playwright install chromium webkit
```

Run the mobile Chromium/WebKit matrix:

```bash
npm run test:e2e
```

Run Lighthouse performance, accessibility and resource budgets:

```bash
npm run test:lighthouse
```

The browser suite covers portrait and landscape layouts, launcher user flows, Screen Lab controls, Workshop Mode, console errors, native touch styles and Chromium offline Service Worker reloads. CI retains screenshots, traces, failure video and private Lighthouse reports. Full thresholds and maintenance rules are in [`docs/QUALITY-GATES.md`](./docs/QUALITY-GATES.md).

## Finish an app

1. Read `AGENTS.md` and `apps/AGENTS.md`.
2. Choose Quick, Enhanced or Godot based on product needs rather than prestige; use Godot only when its scene/animation/physics toolchain materially helps.
3. Replace the starter mechanic with the actual product loop.
4. Preserve app identity, cache ownership and storage namespace.
5. Replace the generated icon with a deliberate application symbol.
6. Update version, release date and changelog before publishing.
7. Run `npm run health` when the validation environment is available.
8. Run relevant Playwright user flows and Lighthouse budgets for affected platform paths.
9. Test installation, long-press, repeated taps, input focus, orientation, safe areas, standalone mode, Workshop actions and update activation on a real phone when the release changes those paths.
10. Squash-merge into `main`; Cloudflare publishes the resulting production commit automatically.

## Product roadmap

The broad evolution is documented in [`docs/ENVIRONMENT-ROADMAP.md`](./docs/ENVIRONMENT-ROADMAP.md). The phased completion log is maintained in [`docs/IMPLEMENTATION-PLAN.md`](./docs/IMPLEMENTATION-PLAN.md).
