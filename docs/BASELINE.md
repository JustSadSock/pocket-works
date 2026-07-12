# Pocket Works — Phase 0 baseline

Captured: 2026-07-12

This document records the first stable reference point before platform-level refactors.

## Production

- Launcher: https://pocket-works.netlify.app/
- Reference app: https://pocket-works.netlify.app/apps/screen-lab/
- Netlify project: `pocket-works`
- Production branch: `main`
- Automatic deployment: enabled for pushes to `main`

## Repository reference

Pre-Phase-0 rollback commit:

```text
6fa130d6b5ef372b4ade6f8a171adbaefbc2fb98
```

This commit is the last documented state before the Phase 0 safety work. The completed Phase 0 squash commit becomes the preferred platform baseline.

## Current structure

```text
/
├── index.html
├── styles.css
├── app.js
├── apps.json
├── manifest.webmanifest
├── sw.js
├── netlify.toml
├── package.json
├── scripts/
│   └── validate.mjs
├── shared/
├── docs/
└── apps/
    ├── AGENTS.md
    ├── _template/
    └── screen-lab/
```

## Reference application

`Screen Lab` is the reference working application for later phases.

It currently verifies:

- independent app routing under `/apps/screen-lab/`;
- its own manifest and Service Worker scope;
- offline app-shell behavior;
- safe-area and dynamic viewport readings;
- orientation, fullscreen, motion and pointer input;
- independent visual identity from the launcher.

Later platform work must keep both the launcher and Screen Lab functional.

## Health command

Run from the repository root:

```bash
npm run health
```

The command validates:

- required launcher files;
- launcher HTML, manifest, icon and Service Worker wiring;
- the application registry;
- every registered app directory;
- app manifest IDs, scopes, names and local icons;
- semantic versions, registry paths, statuses and accent values;
- unique Service Worker cache names;
- ownership-scoped cache cleanup;
- Service Worker registration and app-shell files;
- unregistered application directories.

The same command runs in GitHub Actions and as the Netlify build command.

## Expected paths

| Surface | Expected path |
|---|---|
| Launcher | `/` |
| Registry | `/apps.json` |
| Launcher manifest | `/manifest.webmanifest` |
| Launcher Service Worker | `/sw.js` |
| Screen Lab | `/apps/screen-lab/` |
| Screen Lab manifest | `/apps/screen-lab/manifest.webmanifest` |
| Screen Lab Service Worker | `/apps/screen-lab/sw.js` |

## Known baseline limitations

These are intentionally deferred to later phases:

- no generated per-app metadata yet;
- no shared mobile runtime yet;
- no in-app Service Worker update prompt yet;
- no automated browser smoke tests yet;
- SVG install icons are accepted, but platform-specific PNG icon generation is not yet enforced;
- production health currently proves build-time structure, not full runtime interaction.

## Phase 0 acceptance

Phase 0 is complete when:

1. `npm run health` passes in Netlify;
2. the production deploy is `ready`;
3. `/` and `/apps/screen-lab/` remain available;
4. Screen Lab no longer deletes caches belonging to other Pocket Works applications;
5. this baseline can be used as a rollback and comparison reference.
