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
└── apps/
    ├── _template/             # copy this when starting a new app
    └── <app-slug>/            # one isolated PWA
```

## Add a new app

1. Copy `apps/_template/` to `apps/<unique-slug>/`.
2. Replace all template identifiers, cache names, paths, titles and colors.
3. Build the app inside that directory only.
4. Add one record to `apps.json`.
5. Confirm the app works after the network is disabled.
6. Confirm it can be installed independently from the root launcher.

Read `AGENTS.md` before making changes.
