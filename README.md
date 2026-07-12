# Pocket Works

A monorepo for small, installable, offline-first mobile web applications.

Each app lives in its own directory under `apps/<slug>/` and is registered in `apps.json`. The repository root is a launcher/catalog that links to every app.

## Production

- Launcher: https://pocket-works.netlify.app/
- Reference app: https://pocket-works.netlify.app/apps/screen-lab/
- Production branch: `main`
- Deployment: Netlify continuous deployment from GitHub

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
├── package.json               # repository health commands
├── netlify.toml               # production build and response headers
├── scripts/
│   └── validate.mjs           # launcher and app structural health checks
├── shared/                    # deliberately small shared utilities
├── docs/
│   ├── BASELINE.md            # Phase 0 reference state and rollback point
│   ├── ENVIRONMENT-ROADMAP.md # full platform and tooling roadmap
│   └── IMPLEMENTATION-PLAN.md # phased execution plan and completion log
└── apps/
    ├── AGENTS.md              # mandatory native-mobile behavior for every app
    ├── _template/             # copy this when starting a new app
    └── <app-slug>/            # one isolated PWA
```

## Repository health

Run the same structural check used by CI and Netlify:

```bash
npm run health
```

It validates the root launcher, registry, registered app directories, manifests, local icons, Service Worker ownership, cache names, registration wiring and required app-shell files.

The current reference state and expected production paths are documented in [`docs/BASELINE.md`](./docs/BASELINE.md).

## Add a new app

1. Read both `AGENTS.md` and `apps/AGENTS.md`.
2. Copy `apps/_template/` to `apps/<unique-slug>/`.
3. Replace all template identifiers, cache names, paths, titles and colors.
4. Build the app inside that directory only.
5. Add one record to `apps.json`.
6. Run `npm run health`.
7. Confirm the app works after the network is disabled.
8. Confirm it can be installed independently from the root launcher.
9. Test long-press, double-tap, input focus, orientation, safe areas and standalone mode.

## Product roadmap

The broad evolution of Pocket Works is documented in [`docs/ENVIRONMENT-ROADMAP.md`](./docs/ENVIRONMENT-ROADMAP.md).

The step-by-step execution order, phase boundaries, acceptance criteria and completion log are maintained in [`docs/IMPLEMENTATION-PLAN.md`](./docs/IMPLEMENTATION-PLAN.md).

Implement one phase at a time. Each phase should end with one coherent commit, one Netlify deploy and an updated completion-log entry.
