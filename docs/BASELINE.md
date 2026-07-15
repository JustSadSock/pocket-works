# Pocket Works — platform baseline

Captured: 2026-07-15

This document records the current stable platform contract for later application and infrastructure work.

## Production

- Host: Cloudflare Workers Builds
- Worker: `pocket-works`
- Production branch: `main`
- Build command: `npm run deploy:site`
- Deploy command: `npx wrangler deploy --assets ./dist-site/`
- Worker configuration: `wrangler.jsonc`
- Production source of truth: the latest successful Cloudflare deployment from `main`

## Repository reference

The platform uses isolated application directories and a generated production registry:

```text
/
├── index.html
├── styles.css
├── app.js
├── manifest.webmanifest
├── sw.js
├── package.json
├── wrangler.jsonc
├── scripts/
├── shared/
├── docs/
└── apps/
    ├── _template/
    ├── _enhanced-template/
    └── <app-slug>/
```

The root `apps.json` is not committed. `npm run prepare:site` generates `dist-site/apps.json` from each app-owned `app.config.json`.

## Application boundary

Every application owns:

- `apps/<slug>/app.config.json`;
- its deployable HTML, CSS and JavaScript;
- its manifest, icon and Service Worker;
- its cache and storage namespaces;
- its release metadata and README.

Normal application PRs change exactly one `apps/<slug>/**` directory. Platform changes use a separate PR and the `platform-change` label.

## Health commands

```bash
npm run registry:check
npm run validate:all
npm run prepare:site
npm run validate:site
```

The validation contract checks:

- application metadata and unique identifiers;
- launcher and app manifests;
- Service Worker scope and cache ownership;
- app shell completeness;
- mobile runtime integration;
- update metadata;
- production output isolation;
- Cloudflare Worker configuration;
- separation between fast packaging and exhaustive CI.

## Production acceptance

A platform or release change is complete when:

1. its PR contains the intended isolated change set;
2. relevant checks have completed when runners are available;
3. the PR is squash-merged into `main`;
4. Cloudflare successfully deploys the exact squash commit;
5. the launcher and affected application load from the production Worker;
6. installed PWAs receive the expected versioned update.

## Rollback baseline

Rollback is performed by reverting the faulty squash commit and publishing a new forward-moving application version and cache identity. Historical hosting integrations are not part of the platform contract.
