# Enhanced applications

Pocket Works has two application runtimes.

## Quick PWA

Use Quick for focused tools, experiments and small games that do not need a dependency graph or compilation.

```bash
npm run new:app -- signal-board --runtime=quick --preset=interactive
```

Quick applications remain plain HTML, CSS and JavaScript. They do not pass through Vite and do not ship any Enhanced dependencies.

## Enhanced PWA

Use Enhanced when the product benefits from TypeScript, module bundling, Workbox, automated unit tests or a specialised rendering/audio engine.

```bash
npm run new:app -- particle-room --runtime=enhanced --preset=pixi
```

Available Enhanced presets:

- `vite` — Vite, TypeScript, Workbox and Vitest without an additional engine;
- `pixi` — PixiJS 8 interactive WebGL scene;
- `phaser` — Phaser 3 scene and update loop;
- `tone` — Tone.js instrument with deliberate audio unlocking.

## Directory model

```text
apps/<slug>/
├── app.config.json
├── package.json
├── vite.config.ts
├── tsconfig.json
├── source/
│   ├── index.html
│   ├── main.ts
│   ├── core.ts
│   ├── core.test.ts
│   ├── styles.css
│   └── sw.ts
├── public/
│   └── icons/icon.svg
├── index.html              # generated
├── app.js                  # generated
├── styles.css              # generated
├── manifest.webmanifest    # generated
├── sw.js                   # generated Workbox worker
└── README.md
```

Edit files in `source/`, `public/`, configuration and documentation. Do not edit generated output directly.

## Commands

Install the root toolchain once:

```bash
npm install
```

Build every published Enhanced application:

```bash
npm run build:enhanced
```

Run TypeScript and Vitest for every published Enhanced application:

```bash
npm run test:enhanced
```

Run one workspace:

```bash
npm run build --workspace=@pocket-works/<slug>
npm run typecheck --workspace=@pocket-works/<slug>
npm run test --workspace=@pocket-works/<slug>
```

The normal repository health command builds and tests both runtimes:

```bash
npm run health
```

## PWA behavior

Enhanced applications use `vite-plugin-pwa` with Workbox `injectManifest`.

- the application controls its own Service Worker scope;
- the worker uses app-specific cache naming;
- build assets are precached;
- navigation falls back to the app shell;
- updates remain prompt-based rather than auto-reloading a live session;
- Workshop Mode and the mobile runtime are bundled into the app output;
- no CDN dependency is required at runtime.

## Dependency policy

The build toolchain lives at the repository root. Dependencies are available to Enhanced workspaces but are not copied into Quick applications.

Choose an engine only when it materially helps the product:

- PixiJS for dense custom 2D rendering and WebGL scenes;
- Phaser for scene management, game loops and game-specific systems;
- Tone.js for scheduled, interactive music and audio tools;
- plain Vite TypeScript when platform APIs are enough.

Do not choose Enhanced merely to make a small application look more serious. The user experience, not the size of the toolchain, determines product quality.
