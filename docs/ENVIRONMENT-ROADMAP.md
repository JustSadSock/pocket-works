# Pocket Works — Environment Roadmap

This document preserves the planned evolution of Pocket Works as a personal factory for small, installable, offline-first mobile applications.

The goal is not to turn every experiment into a large framework project. The goal is to make future apps faster to create, safer to publish, broader in capability and more convincing as installed software.

## Product direction

Pocket Works should feel like a private collection of real tools, toys and games rather than a directory of webpages.

The environment should optimize for:

- rapid creation from a short concept;
- distinct visual identity per app;
- isolated failures and isolated storage;
- one-command or one-request publishing;
- smooth installed-mobile behavior;
- strong offline support;
- reusable technical capabilities without forcing a shared visual style;
- easy diagnostics from a phone;
- safe updates and recovery of user data.

## 1. Atomic publishing

Current connector-based file creation may produce several sequential commits. The preferred future workflow is:

```text
create all files
→ validate the complete app
→ create one Git tree
→ create one commit
→ push main
→ one Netlify deployment
```

Benefits:

- Netlify never sees a partially assembled app;
- one application change produces one deployment;
- rollback is simple;
- Git history stays meaningful;
- validation can run before the public version changes.

Target commit style:

```text
Add screen-lab app
Improve Pocket Works launcher
Upgrade app creation pipeline
```

## 2. Pocket Forge — application generator

Create a repository script such as:

```bash
node scripts/new-app.mjs pulse-board --preset=interactive
```

The generator should:

- validate a unique kebab-case slug;
- create `apps/<slug>/` from a chosen preset;
- generate a unique manifest ID, scope and start URL;
- generate unique Service Worker cache and storage namespaces;
- create initial icons or icon source files;
- create an app README;
- create `app.config.json`;
- run validation;
- register the app automatically;
- optionally create a preview entry before publishing.

Suggested presets:

```text
templates/
├── vanilla/        small utility or experiment
├── interactive/    gesture-heavy tool or visual toy
├── game-2d/        game loop, canvas and input layer
├── audio/          Web Audio initialization and controls
├── data-tool/      IndexedDB, import and export
└── enhanced/       Vite and TypeScript project
```

## 3. Replace the manually edited central registry

Each application should eventually own an `app.config.json` file:

```json
{
  "slug": "screen-lab",
  "name": "Screen Lab",
  "description": "An interactive mobile display and input laboratory.",
  "status": "active",
  "version": "1.0.0",
  "accent": "#d7ff46",
  "tags": ["tool", "motion", "offline"]
}
```

A build script should scan application directories and generate `apps.json`.

Advantages:

- metadata lives beside the app it describes;
- removing or moving an app cannot leave a stale registry entry silently;
- schema validation is easier;
- the launcher can be generated from one source of truth.

Use Zod or a lightweight custom validator when the schema becomes complex enough to justify it.

## 4. Two project levels

### Quick PWA

Default for small ideas:

- plain HTML, CSS and JavaScript;
- no build step beyond validation;
- direct browser APIs;
- smallest possible dependency surface;
- fast implementation and easy inspection.

Best for:

- randomizers;
- trackers;
- single-purpose utilities;
- compact visual experiments;
- small games and toys.

### Enhanced PWA

Use only when complexity warrants it:

- Vite;
- TypeScript;
- npm dependencies;
- modular source and generated distribution;
- formal tests;
- generated Service Worker and manifest handling.

Possible foundation:

- `vite-plugin-pwa`;
- Workbox;
- Vitest;
- optional component or rendering libraries.

Do not migrate simple apps merely for consistency. Pocket Works should support both levels indefinitely.

## 5. Launcher evolution

Transform the root launcher into a lightweight personal application shelf rather than a generic app store clone.

Potential features:

- live or generated previews;
- recently opened apps;
- favorites;
- categories and filters;
- search;
- version and last-updated information;
- `offline-ready`, `installed`, `experimental` and `update available` states;
- locally stored usage history;
- per-app changelog;
- long-press quick actions;
- clear application details;
- data reset, export and import actions;
- launcher-level diagnostics.

The visual direction should resemble a cabinet of distinct artifacts. Every app may have its own silhouette, material, typography and motion signature. The launcher provides order without flattening all apps into identical cards.

Avoid:

- an App Store imitation;
- a dashboard of interchangeable rounded tiles;
- one shared color system applied to every app;
- generic category icons and decorative metrics.

## 6. Shared capabilities, not a shared aesthetic

Shared code should provide infrastructure and behavior. It should not force every app to use the same visual components.

Suggested structure:

```text
shared/
├── pwa/
├── updates/
├── storage/
├── input/
├── motion/
├── audio/
├── sensors/
├── export/
├── diagnostics/
└── accessibility/
```

Potential modules:

### PWA and updates

- Service Worker registration;
- waiting-update detection;
- update prompt and reload flow;
- cache version helpers;
- online/offline state;
- install-state detection;
- iOS installation instructions.

### Storage

- namespaced settings;
- IndexedDB database initialization;
- migrations;
- schema validation;
- export/import;
- automatic backup snapshots;
- recovery from malformed state.

Dexie is a strong candidate for apps with structured IndexedDB data.

### Input

- Pointer Event gesture state;
- pointer capture;
- tap, drag, swipe and long-press recognition;
- gesture cancellation;
- velocity tracking;
- keyboard and controller abstraction where useful.

### Motion

- interruptible springs;
- velocity-aware release;
- stagger and reveal helpers;
- reduced-motion adaptation;
- frame-budget monitoring.

Motion is a candidate for DOM and SVG interactions. It should remain optional rather than a universal dependency.

### Export

- JSON export and import;
- image export;
- share-sheet support;
- file-system access where supported;
- safe filename generation.

### Sensors

- orientation and motion permission flow;
- sensor normalization;
- feature detection;
- fallback interaction models.

## 7. Native-feeling application experience

Every app should be judged as installed software, not merely responsive web content.

Detailed mandatory rules live in `apps/AGENTS.md`.

Core expectations include:

- no accidental text selection on controls;
- no irrelevant iOS long-press callouts;
- no random double-tap zoom;
- no focus-triggered input zoom;
- intentional pinch behavior;
- no browser image dragging;
- no blue tap flash or generic link states;
- no browser alerts or prompts;
- stable safe areas and `100dvh` layouts;
- controlled overscroll and internal scrolling;
- software-keyboard-aware layouts;
- immediate pressed feedback;
- interruptible, high-quality animation;
- state preservation across reload, suspension and resume;
- seamless offline operation;
- coherent icons, status bar color and launch appearance.

Native feel must not be achieved by blindly disabling accessibility. Selection, zoom and context behavior should be preserved where they are genuinely useful.

## 8. Workshop Mode

Add an optional hidden diagnostics panel to apps, activated by an intentional gesture such as holding a version mark or app symbol.

Possible information:

- viewport and visual viewport;
- device pixel ratio;
- safe-area values;
- browser versus standalone mode;
- FPS and frame-time history;
- storage usage;
- active Service Worker and cache version;
- online/offline status;
- last update time;
- current app version;
- recent errors;
- pointer and sensor state.

Possible actions:

- clear app cache;
- reset local state;
- export data;
- import data;
- simulate offline behavior;
- force reduced-motion mode;
- reveal touch targets;
- reveal layout bounds;
- inspect current storage namespaces;
- check for an update.

Workshop Mode must remain absent from ordinary visual hierarchy and must not compromise production performance.

## 9. Update system

Create a shared update manager that handles waiting Service Workers and version changes.

Desired flow:

```text
New version available
[Update now] [Later]
```

After updating:

```text
Screen Lab 1.1.0
— Added sensor calibration
— Improved landscape handling
— Fixed stale viewport values
```

Requirements:

- never silently destroy unsaved state;
- save or serialize important state before reload;
- expose the current app version;
- retain a small migration history;
- delete only caches owned by the app;
- allow critical fixes to request immediate update without creating an infinite reload loop.

## 10. Broader creative and technical arsenal

Libraries should be chosen per project, not installed globally by default.

### Motion

Use for:

- DOM and SVG animation;
- springs;
- gesture-linked transitions;
- layout continuity;
- velocity-aware interaction.

### Dexie

Use for:

- substantial local data;
- structured IndexedDB stores;
- migrations;
- offline-first records;
- binary or larger data.

### Zod

Use for:

- validating app metadata;
- validating imported saves;
- validating settings and migration boundaries;
- deriving TypeScript types in enhanced projects.

### Lit

Use selectively for:

- isolated reusable Web Components;
- shared infrastructure controls;
- encapsulated behavior without adopting React across the repository.

### Shoelace or similar component libraries

Use only for secondary, non-signature controls such as dialogs, menus and accessible form primitives.

Do not use a component library as the visual identity of an app.

### PixiJS

Use for:

- high-object-count 2D rendering;
- particles;
- interactive visual fields;
- nontraditional interfaces;
- GPU-accelerated art and simulation.

### Phaser

Use for:

- larger 2D games;
- scenes;
- cameras;
- asset management;
- game input;
- game-oriented physics and lifecycle.

### Tone.js

Use for:

- procedural sound;
- musical tools;
- rhythm mechanics;
- synchronized audio events;
- synthesis and effects.

Sound must remain optional and user-controlled.

### Workbox and vite-plugin-pwa

Use in enhanced projects for:

- generated precaching;
- runtime caching strategies;
- update handling;
- offline fallbacks;
- background retry where appropriate.

## 11. Testing and deployment quality

### Repository validation

Expand the existing validator to check:

- metadata schemas;
- duplicate namespaces;
- manifest correctness;
- Service Worker scope;
- missing assets;
- broken relative links;
- icon presence and dimensions;
- accidental root-scoped caches;
- forbidden placeholder values.

### Playwright

Use for cross-browser and mobile behavior:

- Chromium;
- WebKit;
- Firefox;
- narrow mobile viewport;
- tall iPhone-like viewport;
- portrait and landscape;
- interaction smoke tests;
- screenshot comparisons;
- console-error detection.

### Lighthouse CI

Suggested baseline targets:

```text
Performance >= 80
Accessibility >= 90
Best Practices >= 90
```

Treat these as regression guards, not as a substitute for real interaction testing.

### Vitest

Use for:

- generators;
- state machines;
- migrations;
- import/export logic;
- game rules;
- calculations;
- registry generation.

## 12. Data safety

For applications containing meaningful user-created data:

- use versioned schemas;
- validate before loading;
- migrate incrementally;
- preserve the last known-good snapshot;
- provide export and import;
- do not erase state when an update fails;
- store app data under a unique namespace;
- document reset behavior clearly.

The launcher may eventually provide centralized backup discovery, but it must not become the runtime owner of app data.

## 13. Suggested implementation order

### Phase 1 — publishing and consistency

1. Atomic commits for full app changes.
2. `app.config.json` per app.
3. Generated `apps.json`.
4. Pocket Forge generator.
5. Stronger validation.

### Phase 2 — app experience

1. Shared update manager.
2. Native-feel baseline utilities.
3. Workshop Mode.
4. Export/import helpers.
5. Keyboard and visual viewport helpers.

### Phase 3 — launcher

1. Favorites and recent apps.
2. Versions and update states.
3. Better individual previews.
4. Search and categories.
5. App data and diagnostics actions.

### Phase 4 — enhanced projects

1. Vite and TypeScript preset.
2. Workbox and PWA generation.
3. Vitest.
4. Playwright smoke testing.
5. Lighthouse CI.

### Phase 5 — creative libraries

1. Motion helper preset.
2. PixiJS visual preset.
3. Phaser game preset.
4. Tone.js audio preset.
5. Dexie data-heavy preset.

## Decision principle

When choosing between adding a universal abstraction and completing a strong app, prefer the app.

Promote code into `shared/` only after repeated real use demonstrates a stable abstraction.

Pocket Works succeeds when a new idea can quickly become a distinct, reliable, installable application without inheriting the visual or architectural baggage of every previous project.