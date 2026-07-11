# AGENTS.md — Pocket Works

This repository is a collection of small, installable, offline-first mobile web applications. Treat every app as a real product, not a disposable demo.

## 1. Non-negotiable repository rules

- Every app lives in `apps/<slug>/` and must remain independently runnable.
- Do not modify another app unless the user explicitly asks for it.
- Do not put app-specific CSS, assets, state, cache logic or dependencies in the repository root.
- Shared code belongs in `shared/` only when at least two real apps use it and the abstraction is genuinely stable.
- Prefer duplication of a tiny helper over a premature shared framework.
- Register every visible app in `apps.json`.
- The root launcher is only a catalog. It must not become an app framework or hidden dependency.
- Never silently rename, move or delete an existing app.
- Never reuse a Service Worker cache name, manifest `id`, `start_url`, `scope`, storage namespace or IndexedDB database name across apps.
- Work only in the target app directory plus the exact registry/shared files required for the task.

## 2. Default product standard

Each app must feel intentional, complete and usable on a phone. A finished app includes:

- a clear primary purpose;
- a meaningful interaction loop, not decorative buttons;
- real empty, loading, error and completion states where applicable;
- local persistence when user-created state exists;
- installable PWA metadata;
- reliable offline behavior after the first successful load;
- touch-friendly controls and safe-area support;
- visible feedback for every user action;
- no console errors in the normal flow;
- no placeholder copy, dead controls or fake functionality.

Do not ship a screen that only looks interactive. Every visible control must work or be removed.

## 3. Design doctrine: avoid generic AI output

Do not default to the familiar synthetic SaaS look. Avoid unless the concept specifically demands it:

- purple/blue gradients on dark backgrounds;
- glassmorphism everywhere;
- large rounded cards floating in empty space;
- excessive pills and capsule buttons;
- giant marketing headlines inside utility apps;
- three-column dashboard grids on mobile;
- generic neon glow;
- random red horizontal accent lines;
- decorative charts with fake data;
- emoji used as the primary icon system;
- identical corner radii on every object;
- a visual hierarchy created only through font size;
- interchangeable "premium" black-and-gold styling;
- ornamental noise that does not reinforce the concept.

Instead, derive the visual language from the app's core idea. Before coding, define internally:

1. **Visual premise** — what physical object, era, material, subculture, interface tradition or unusual metaphor informs the design?
2. **Dominant geometry** — sharp, soft, modular, irregular, typographic, diagrammatic, tactile, etc.
3. **One memorable signature** — a unique transition, control, spatial behavior, material effect or visual rule.
4. **Constraint** — one thing the design deliberately refuses to use.

Each new app must look materially different from the recent apps in this repository. Do not copy an existing app's palette, typography, card shape, navigation structure or hero composition unless explicitly requested.

## 4. Composition and typography

- Design for the actual mobile viewport first, including `100dvh`, safe areas and browser chrome changes.
- Use composition, spacing, contrast and rhythm before adding containers.
- Avoid wrapping every group in a card. Use cards only when they express a real object or grouping.
- Establish a small spacing system, but permit deliberate asymmetry.
- Use no more than two font families per app unless the concept requires more.
- Typography must remain readable at 320 CSS pixels wide.
- Do not use ultra-light body text or tiny low-contrast labels.
- Prefer short interface copy. Labels should describe actions, not moods.
- Use icons only when their meaning is obvious; pair ambiguous icons with text or accessible labels.

## 5. Interaction and mechanics

Every app needs a coherent interaction model. Do not bolt interactions onto a static composition.

- Identify the primary action and make it reachable with one thumb.
- Keep the primary action stable in location unless movement itself is part of the mechanic.
- Use direct manipulation where possible: drag, swipe, press-and-hold, scrub, rotate, reorder, reveal.
- Do not add gestures with no visible affordance or fallback control.
- Avoid interactions that require hover.
- Do not hijack vertical page scrolling unless the app is explicitly a full-screen canvas/game.
- Distinguish tap, drag and long-press thresholds to prevent accidental actions.
- Provide undo for destructive or high-cost actions when practical.
- Destructive actions need confirmation or an easy recovery path.
- Haptic-like visual feedback should be immediate: pressed state within one frame, state result without ambiguity.
- If the app is a game or toy, define a genuine loop: input → system response → changed state → next decision.
- Randomness must create decisions or variety, not merely shuffle cosmetics.
- Difficulty should emerge from mechanics, timing, information or trade-offs, not unreadable controls.

## 6. Motion and animation

Motion must explain state, reinforce tactility or create identity. It is not wallpaper.

### Motion principles

- Animate causes and consequences, not arbitrary elements.
- Preserve spatial continuity: objects should appear to come from somewhere and go somewhere.
- Use transforms and opacity for frequent animations; avoid layout-thrashing properties.
- Input feedback should begin in roughly 16–80 ms.
- Micro-interactions usually belong in the 90–220 ms range.
- Larger transitions usually belong in the 220–500 ms range.
- Long ambient motion must be subtle, interruptible and low-cost.
- Avoid identical easing everywhere. Use sharper easing for direct input, softer easing for settling and spring-like easing only where physicality is useful.
- Never delay a functional action just to finish an animation.
- Animations must tolerate rapid repeated input without stacking into chaos.
- Respect `prefers-reduced-motion`; replace movement with opacity, instant state changes or shorter transitions.

### Required micro-feedback

Where relevant, implement:

- press/depress state for buttons and tappable surfaces;
- clear focus state for keyboard and assistive input;
- drag pickup, movement and drop feedback;
- success, failure and invalid-action feedback;
- subtle state transitions for toggles, counters and mode changes;
- loading progress that reflects real work when measurable;
- content insertion/removal transitions that preserve context.

Do not animate every element on initial load. A UI that performs a five-second entrance dance every time is broken, not cinematic.

## 7. Mobile ergonomics

- Support portrait by default. Add landscape only when useful, not automatically.
- Use `viewport-fit=cover` and account for `env(safe-area-inset-*)`.
- Use `100dvh` instead of relying only on `100vh`.
- Minimum comfortable tap target: approximately 44×44 CSS pixels.
- Keep critical controls away from the home indicator and Dynamic Island/cutout regions.
- Test narrow screens, tall screens, landscape, increased text size and browser mode versus installed standalone mode.
- Prevent accidental text selection in game-like controls, but preserve selection in content and editing surfaces.
- Avoid fixed elements that cover focused inputs when the software keyboard opens.
- Do not rely on double-tap, edge-only gestures or multi-touch unless central to the concept.

## 8. PWA and offline requirements

Every app must contain its own:

- `manifest.webmanifest`;
- `sw.js`;
- install icons;
- unique manifest `id`;
- unique `start_url` and `scope` ending inside the app directory;
- unique cache namespace with a version suffix;
- offline fallback strategy;
- local storage namespace.

Rules:

- The app shell must load offline after one successful online visit.
- Cache only files owned by the app plus explicitly required shared files.
- Do not use a root-scoped Service Worker for individual apps.
- Do not cache third-party responses blindly.
- Prefer local assets over CDN dependencies for offline-critical behavior.
- Version caches deliberately and delete obsolete cache versions during activation.
- Never delete caches belonging to another app.
- If data sync exists, the local version remains the source of immediate interaction and sync failures must not destroy local data.
- Store small preferences in `localStorage`; use IndexedDB for larger, structured or binary data.
- Export/import user data when loss would be painful.

## 9. Performance

- Target smooth interaction on a modern phone, not only desktop Chrome.
- Keep initial assets small and intentional.
- Avoid large frameworks for apps that can be written cleanly with platform APIs.
- Prefer SVG, CSS or generated visuals when they are simpler than large raster assets.
- Lazy-load optional heavy assets.
- Do not run permanent high-frequency loops when the app is hidden or idle.
- Pause animation and simulation on `visibilitychange` when appropriate.
- Avoid excessive blur, filters, huge shadows and full-screen backdrop effects.
- Canvas/WebGL loops should adapt to device pixel ratio and frame budget.
- Use passive event listeners where appropriate, but not when gesture cancellation is required.

## 10. Accessibility and resilience

- Use semantic HTML before ARIA.
- Every control needs an accessible name.
- Do not encode important meaning through color alone.
- Maintain readable contrast for essential text and controls.
- Support keyboard navigation when the interaction model permits it.
- Preserve user state across reloads when expected.
- Validate stored data before reading it; migrations must fail safely.
- Handle malformed imports and unavailable APIs without blanking the app.
- Feature-detect browser APIs.
- Provide a usable fallback for unsupported optional features.

## 11. Engineering style

- Prefer plain HTML, CSS and JavaScript for small apps.
- Add a build tool or framework only when complexity clearly justifies it.
- Keep modules focused and names explicit.
- Separate state, rendering and input logic once the app grows beyond a trivial file.
- Avoid global mutable state where practical.
- Never create one enormous `index.html` merely to reduce file count.
- Do not add dependencies for functionality available cleanly in the platform.
- Comment decisions and non-obvious invariants, not obvious syntax.
- Remove abandoned experiments, commented-out blocks and debug overlays before finishing.
- Keep app-specific documentation in `apps/<slug>/README.md`.

## 12. Required app structure

A typical app should resemble:

```text
apps/<slug>/
├── index.html
├── styles.css
├── app.js
├── manifest.webmanifest
├── sw.js
├── README.md
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── assets/
```

Additional modules are encouraged when they improve clarity. Empty directories are not preserved by Git; add files only when needed.

## 13. Registry contract

`apps.json` is an array of objects with this shape:

```json
{
  "slug": "example-app",
  "name": "Example App",
  "description": "One precise sentence.",
  "path": "./apps/example-app/",
  "accent": "#c7ff4a",
  "status": "active",
  "version": "1.0.0",
  "tags": ["tool", "offline"]
}
```

- `slug` must match the directory name.
- `path` must end with `/`.
- `accent` is used only by the launcher and must maintain sufficient contrast.
- Allowed status values: `active`, `experimental`, `archived`.
- Do not insert fake apps or placeholders into the registry.

## 14. Workflow for creating a new app

1. Read this file and inspect only the target template/shared utilities needed.
2. Define the app's purpose, interaction loop, visual premise, signature and constraint.
3. Create `apps/<slug>/` from the template.
4. Replace every template identifier before implementing features.
5. Build the smallest complete working loop first.
6. Add visual refinement, motion and micro-feedback after functionality exists.
7. Test browser mode, standalone mode assumptions, offline reload and narrow viewport.
8. Confirm storage, cache and manifest identifiers are unique.
9. Add the app to `apps.json` only when it is actually usable.
10. Update the app README with concept, controls, storage and known limitations.

## 15. Definition of done

An app is done only when:

- its main loop works from first launch to completion;
- all visible controls function;
- the design has a distinct premise and does not resemble a generic template;
- touch targets and safe areas are correct;
- interaction feedback is immediate and coherent;
- reduced motion is supported;
- refresh preserves expected state;
- the app shell reloads without a network connection;
- manifest paths and Service Worker scope are valid;
- it does not modify, cache or break neighboring apps;
- `apps.json` is valid JSON;
- the app README is current;
- no obvious console errors remain.

When forced to choose, prefer a smaller app with one excellent mechanic over a broad app made of shallow features.
