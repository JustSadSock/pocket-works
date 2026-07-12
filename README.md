# Pocket Works

A monorepo for small, installable, offline-first mobile web applications.

Each application lives in `apps/<slug>/`. Its `app.config.json` is the source of truth; `apps.json` is generated for the launcher.

## Production

- Launcher: https://pocket-works.netlify.app/
- Reference app: https://pocket-works.netlify.app/apps/screen-lab/
- Production branch: `main`
- Deployment: Netlify continuous deployment from GitHub

## Personal application shelf

Pocket Works is not a static link index. The root PWA provides:

- search across names, descriptions, mechanics, tags and release notes;
- filters for saved, recent, offline-ready and experimental applications;
- persistent favorites, recents, selection and sort order;
- procedural app previews derived from each app's preset, slug and accent;
- version, update date, cache readiness and release notes;
- a desktop focus bay and mobile bottom-sheet details panel;
- quick actions for open, save and copy link;
- a locally saved registry fallback when the live registry is unavailable.

The shelf uses `shared/mobile-runtime.*` for native-feeling behavior and remains useful offline after the first successful load.

## Repository layout

```text
/
├── AGENTS.md
├── apps.json                    # generated launcher registry
├── index.html
├── styles.css
├── app.js
├── manifest.webmanifest
├── sw.js
├── package.json
├── netlify.toml
├── scripts/
│   ├── app-config.mjs           # config schema and uniqueness rules
│   ├── build-registry.mjs       # app.config.json → apps.json
│   ├── new-app.mjs              # Pocket Forge CLI
│   ├── presets.mjs              # starter mechanics
│   ├── test-forge.mjs           # smoke-tests every preset
│   └── validate*.mjs
├── shared/
│   ├── mobile-runtime.*         # native-feeling behavior
│   └── update-manager.*         # controlled PWA updates
├── docs/
│   ├── BASELINE.md
│   ├── PUBLISHING.md
│   ├── ENVIRONMENT-ROADMAP.md
│   └── IMPLEMENTATION-PLAN.md
└── apps/
    ├── AGENTS.md
    ├── _template/
    └── <app-slug>/
        └── app.config.json
```

## Create a new app

Use Pocket Forge instead of copying the template manually:

```bash
npm run new:app -- signal-board --preset=interactive --name="Signal Board"
```

Available presets:

- `vanilla` — focused persistent utility shell;
- `interactive` — pointer capture and direct manipulation;
- `canvas` — responsive high-DPI drawing surface;
- `game-2d` — lightweight animation/game loop;
- `audio` — user-gesture-safe Web Audio starter.

Useful options:

```text
--description="One sentence purpose"
--release-note="Initial user-visible release note"
--accent=#ff4d1f
--background=#10110f
--theme=#10110f
--orientation=portrait|landscape|any
--status=active|experimental
--order=100
```

Pocket Forge creates the directory, starter mechanic, manifest, app-owned icon, Service Worker cache identity, storage namespace, release metadata and `app.config.json`. It regenerates `apps.json` and runs the full validation suite. A failed generation is rolled back.

## Registry

Never edit `apps.json` by hand.

```bash
npm run registry:build
npm run registry:check
```

The build command scans every non-template application directory and generates the launcher registry from `app.config.json` files. Duplicate slugs, cache names and storage namespaces are rejected.

## Managed updates

Every installed PWA uses `shared/update-manager.js` and `shared/update-manager.css`.

A new worker downloads into the waiting state, reports its version and changelog, and shows an in-app prompt. It activates only after the user selects **Update now**. Choosing **Later** leaves the current session unchanged.

Each release must update:

- `version`;
- `releaseDate`;
- `changelog`;
- `cacheName`;
- matching Service Worker metadata.

The complete atomic release and rollback procedure is in [`docs/PUBLISHING.md`](./docs/PUBLISHING.md).

## Repository health

Run the same checks used by GitHub Actions and Netlify:

```bash
npm run health
```

This validates repository/PWA structure, generated metadata, manifests, icons, Service Worker ownership, mobile-runtime wiring, managed-update wiring, launcher shelf behavior, script syntax and all five Pocket Forge presets.

The current reference state and expected production paths are documented in [`docs/BASELINE.md`](./docs/BASELINE.md).

## Finish an app

After generation:

1. Read `AGENTS.md` and `apps/AGENTS.md`.
2. Replace the starter mechanic with the actual product loop inside its own directory.
3. Preserve the generated app identity, cache ownership and storage namespace.
4. Replace the generated icon with a deliberate application symbol.
5. Update version, release date and changelog before publishing.
6. Run `npm run health`.
7. Test offline launch, installation, long-press, repeated taps, input focus, orientation, safe areas, standalone mode and update activation.

## Product roadmap

The broad evolution of Pocket Works is documented in [`docs/ENVIRONMENT-ROADMAP.md`](./docs/ENVIRONMENT-ROADMAP.md).

The execution order and phase completion log are maintained in [`docs/IMPLEMENTATION-PLAN.md`](./docs/IMPLEMENTATION-PLAN.md).
