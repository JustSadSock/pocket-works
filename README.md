# Pocket Works

A monorepo for small, installable, offline-first mobile web applications.

Each app lives in its own directory under `apps/<slug>/` and is registered in `apps.json`. The repository root is a launcher/catalog that links to every app.

## Repository layout

```text
/
├── AGENTS.md                  # global engineering, design and interaction rules
├── apps.json                  # app registry used by the root launcher
├── index.html                 # root launcher
├── styles.css                 # launcher-only styles
├── app.js                     # launcher-only logic
├── manifest.webmanifest       # launcher PWA manifest
├── sw.js                      # launcher service worker
├── shared/                    # deliberately small shared utilities
├── docs/
│   └── ENVIRONMENT-ROADMAP.md # planned platform, tooling and launcher evolution
└── apps/
    ├── AGENTS.md              # mandatory native-mobile behavior for every app
    ├── _template/             # copy this when starting a new app
    └── <app-slug>/            # one isolated PWA
```

## Add a new app

1. Read both `AGENTS.md` and `apps/AGENTS.md`.
2. Copy `apps/_template/` to `apps/<unique-slug>/`.
3. Replace all template identifiers, cache names, paths, titles and colors.
4. Build the app inside that directory only.
5. Add one record to `apps.json`.
6. Confirm the app works after the network is disabled.
7. Confirm it can be installed independently from the root launcher.
8. Test long-press, double-tap, input focus, orientation, safe areas and standalone mode.

## Product roadmap

The planned evolution of Pocket Works is documented in [`docs/ENVIRONMENT-ROADMAP.md`](./docs/ENVIRONMENT-ROADMAP.md).

It covers atomic publishing, Pocket Forge app generation, generated registries, shared capabilities, update handling, Workshop Mode, launcher improvements, testing and optional libraries such as Motion, Dexie, PixiJS, Phaser and Tone.js.