# Pocket Works automated quality gates

Phase 7 adds real-browser and performance checks on top of the structural `npm run health` contract.

## Local preparation

```bash
npm install
npx playwright install chromium webkit
npm run build:quality-site
```

`build:quality-site` builds registered Enhanced applications, assembles `dist-site/` and validates that the preview contains deployable assets only.

## Browser matrix

```bash
npm run test:e2e
```

Playwright starts `scripts/serve-site.mjs` automatically and runs:

- Chromium mobile portrait using the Pixel 5 device profile;
- WebKit mobile portrait using the iPhone 13 device profile;
- Chromium mobile landscape for orientation-critical scenarios;
- WebKit mobile landscape for orientation-critical scenarios.

The suite verifies:

- launcher search, empty state, details, favorites and persisted shelf state;
- keyboard focus behavior;
- Screen Lab live viewport metrics;
- repeated mobile taps and control state recovery;
- Workshop Mode diagnostics, scroll locking, close behavior and focus restoration;
- native control styles such as `touch-action`, non-selection and transparent tap highlighting;
- absence of horizontal document overflow;
- absence of uncaught page errors, console errors and browser dialogs;
- portrait and landscape startup layout;
- critical screenshots for launcher, Screen Lab and Workshop Mode;
- Chromium Service Worker activation and offline reload for the launcher and Screen Lab;
- cached manifest availability while offline.

Playwright's programmable Service Worker inspection is Chromium-only. WebKit still runs all user-interface, touch, viewport and orientation scenarios.

### Artifacts

On CI, the `playwright-report` artifact retains:

- the HTML report;
- critical screenshots;
- failure screenshots;
- traces on the first retry;
- videos for failed tests.

Artifacts are private to GitHub Actions and expire after 14 days.

## Lighthouse budgets

```bash
npm run test:lighthouse
```

Lighthouse CI audits the assembled production launcher and Screen Lab three times each using its local static server. Median assertions use the middle result of three independent runs; pessimistic resource assertions still use the largest measured result.

Hard gates:

- performance category at least 0.75;
- accessibility at least 0.90;
- best practices at least 0.90;
- cumulative layout shift no more than 0.10;
- largest contentful paint no more than 4 seconds;
- total blocking time no more than 600 milliseconds;
- total transferred resources no more than 1.5 MB;
- JavaScript resources no more than 900 KB;
- zero third-party requests.

SEO, first contentful paint and time to interactive initially report warnings rather than blocking releases. Tighten these thresholds after enough stable CI history exists; do not lower a hard threshold merely to make a single build pass.

The launcher preview scan uses transform-only motion because Lighthouse identified animated background positioning as a non-composited path. The `lighthouse-report` artifact contains private HTML and JSON reports plus the result manifest.

## CI topology

The workflow has four independent jobs:

1. `health` — structure, generators, PWA contracts, unit tests and production assembly;
2. `enhanced-presets` — generation, type checking, testing and building of all Enhanced presets;
3. `browser-quality` — Playwright Chromium/WebKit matrix after `health` succeeds;
4. `lighthouse` — performance and accessibility budgets after `health` succeeds.

A release is mergeable only when every required job succeeds.

## Updating tests

- Add a user-flow test when an important control, mode or navigation path is introduced.
- Add an orientation assertion when layout structure changes.
- Keep dynamic regions masked in critical screenshots instead of weakening the full test.
- Never commit `test.only` or focused suites.
- Do not ignore a console error globally; fix it or document and scope the exact expected case.
- Service Worker tests must remain Chromium-scoped until Playwright exposes equivalent WebKit inspection.
- Keep performance budgets in `lighthouserc.json` and explain any threshold change in the release notes or pull request.
