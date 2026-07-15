# Pocket Works — Environment Roadmap

Pocket Works is a personal factory for small, installable, offline-first mobile applications. The environment should make new apps fast to create, safe to publish and distinct enough to feel like real software rather than interchangeable web pages.

## Product direction

Pocket Works optimizes for:

- rapid creation from a short concept;
- a distinct visual identity for every app;
- isolated failures, caches and storage;
- concurrent application development without shared-file conflicts;
- smooth installed-mobile behavior;
- strong offline support;
- reusable technical capabilities without a shared aesthetic;
- diagnostics that work from a phone;
- safe updates and recovery of user data;
- automatic production publishing from `main`.

## 1. Atomic delivery

The preferred workflow is:

```text
create or update one isolated app
→ validate the completed change
→ open a pull request
→ squash-merge into main
→ Cloudflare builds dist-site
→ Wrangler publishes the pocket-works Worker
```

One application release should produce one meaningful commit and one production deployment. Intermediate or partially assembled files must not reach `main`.

## 2. Concurrent application ownership

Every application lives in `apps/<slug>/` and owns its metadata through `app.config.json`.

Ordinary application PRs:

- modify exactly one `apps/<slug>/**` directory;
- do not edit root, shared, scripts, workflows or other apps;
- may merge in any order;
- do not rebuild or commit a central registry;
- use a separate platform PR when a shared capability is required.

The launcher registry is generated into `dist-site/apps.json` during production assembly.

## 3. Pocket Forge

Pocket Forge should continue to create complete application directories with:

- a unique lowercase kebab-case slug;
- application metadata;
- a manifest and install icon;
- a scoped Service Worker;
- unique cache and storage namespaces;
- local persistence where appropriate;
- a finished entry screen;
- a working primary interaction loop;
- app-owned documentation;
- a deliberate visual premise rather than a generic preset skin.

Forge templates are technical starting points, not finished designs.

## 4. Two application runtimes

### Quick PWA

Default for focused tools, experiments and compact games:

- plain HTML, CSS and JavaScript;
- direct browser APIs;
- minimal dependency surface;
- fast inspection and iteration.

### Enhanced PWA

Use when complexity materially benefits from:

- Vite;
- TypeScript;
- formal unit tests;
- PixiJS, Phaser or Tone.js;
- generated Workbox assets;
- a real source/build separation.

Simple apps should not migrate merely for consistency.

## 5. Launcher evolution

The root launcher is a personal application shelf, not an app-store imitation.

Useful capabilities include:

- search and filters;
- favorites and recents;
- generated or live previews;
- version and release notes;
- offline-ready and update states;
- application details;
- installation and update guidance;
- launcher-level diagnostics.

The launcher supplies order without flattening every app into the same card, palette or navigation pattern.

## 6. Shared capabilities, not shared visuals

Shared modules may provide:

- viewport and safe-area handling;
- pointer lifecycle and gesture primitives;
- interruptible motion;
- versioned local storage;
- import and export;
- audio initialization and feedback;
- motion and orientation permission handling;
- diagnostics and Workshop Mode;
- managed Service Worker updates.

Shared code must remain visually neutral. An app’s appearance belongs inside its own directory.

## 7. Native-feeling mobile behavior

Every app should be evaluated as installed software.

Core expectations:

- no accidental text selection on controls;
- no irrelevant long-press callouts or browser drag behavior;
- no undocumented essential gestures;
- correct safe areas and dynamic viewport sizing;
- software-keyboard-aware layouts;
- visible pressed, dragging, success and error states;
- interruptible animation;
- controlled overscroll and internal scrolling;
- preservation of expected state after suspension or reload;
- usable offline behavior after the first successful load;
- deliberate icon, theme color and launch appearance;
- reduced-motion support.

Native feel must not be achieved by disabling useful accessibility behavior.

## 8. Managed updates

A new Service Worker reaches the waiting state and presents an explicit update prompt.

Requirements:

- never silently destroy an active session;
- expose version, date and release notes;
- activate only after the user confirms;
- reload once after `controllerchange`;
- delete only caches owned by the current app;
- move version and cache identity forward for every rollback release.

## 9. Workshop Mode and diagnostics

Workshop Mode should remain optional and outside the ordinary visual hierarchy.

Useful information:

- viewport and visual viewport;
- device pixel ratio and safe areas;
- standalone state;
- frame timing;
- storage usage;
- current app and cache version;
- online/offline state;
- recent errors;
- pointer and sensor state.

Useful actions:

- export diagnostics;
- reset only app-owned state;
- clear only app-owned caches;
- reveal touch or layout bounds;
- check for updates.

## 10. Testing and quality gates

Repository validation should cover:

- metadata schemas;
- duplicate identifiers and namespaces;
- manifest correctness;
- Service Worker scope;
- missing assets and broken relative paths;
- icon presence;
- cache ownership;
- release metadata consistency;
- isolated PR scope;
- production directory cleanliness;
- Cloudflare Worker configuration.

Browser testing should cover Chromium and WebKit mobile profiles, portrait and landscape layouts, primary interaction loops, offline reloads, console errors and horizontal overflow.

Performance and accessibility budgets are regression guards, not substitutes for real interaction testing.

## 11. Production architecture

Production is published through Cloudflare Workers Builds.

```text
main
→ npm run deploy:site
→ npm run prepare:site
→ npm run validate:site
→ npx wrangler deploy --assets ./dist-site/
```

`wrangler.jsonc` must keep:

- Worker name `pocket-works`;
- an explicit compatibility date;
- assets directory `./dist-site`.

The production build packages already-prepared deployable files. Exhaustive audits and browser matrices remain CI responsibilities and must not be moved into the fast deployment command.

## 12. Data safety

Applications containing meaningful user-created data should:

- use versioned schemas;
- validate before loading;
- migrate incrementally;
- preserve a last known-good snapshot;
- provide export and import;
- avoid erasing data when an update fails;
- store data under an app-owned namespace;
- document reset behavior clearly.

## 13. Design doctrine

Each new app needs one recognizable product decision: a mechanic, spatial model, navigation principle, material language, animation character or interaction metaphor.

Avoid defaulting to:

- dark neon dashboards;
- glass surfaces without functional reason;
- endless rounded cards;
- generic giant headings;
- decorative charts or metrics;
- repeated red divider lines;
- emoji as the primary icon system;
- visual patterns copied from recent apps.

Originality must improve the product rather than obscure basic controls.

## Current priorities

1. Keep app PRs isolated and order-independent.
2. Keep Cloudflare publishing automatic and provider-specific details out of app work.
3. Reduce CI cost with path-aware checks and self-hosted capacity where useful.
4. Improve first-launch clarity and real-device mobile testing.
5. Expand shared capabilities only after multiple apps prove the need.
6. Preserve distinct visual languages across new releases.
