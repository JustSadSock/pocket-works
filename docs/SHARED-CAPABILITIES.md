# Shared capabilities and Workshop Mode

Pocket Works shared capabilities provide behavior, not a common visual design. Every module is an opt-in ES module and has no remote runtime dependency.

## Module map

### `shared/capabilities/motion.js`

Use for interruptible value animation, spring settlement and visibility-aware animation loops.

```js
import { animateSpring, createRafLoop } from '../../shared/capabilities/motion.js';

const animation = animateSpring({
  from: 0,
  to: 1,
  onUpdate(value) {
    element.style.setProperty('--progress', value);
  }
});

const loop = createRafLoop((now, delta) => updateSimulation(delta));
```

The helpers respect reduced motion and animation loops pause while the document is hidden by default.

### `shared/capabilities/storage.js`

Use for small application state that needs schema versions, migrations, validation and export.

```js
import { createVersionedStore } from '../../shared/capabilities/storage.js';

const store = createVersionedStore({
  namespace: 'pocket-works:example',
  version: 2,
  defaults: { score: 0 },
  migrations: {
    1(oldState) {
      return { score: oldState.points || 0 };
    }
  },
  validate(value) {
    return Number.isFinite(value?.score);
  }
});
```

Use IndexedDB instead when data is large, binary, relational or frequently queried. Dexie remains a justified future option for those applications; it is not loaded into every Quick PWA.

### `shared/capabilities/transfer.js`

Provides bounded JSON import, local JSON export and clipboard fallback. Imports must still be validated by the application before replacing user data.

### `shared/capabilities/audio.js`

Creates quiet procedural interaction feedback through Web Audio. Audio is unlocked by an intentional user gesture, can be disabled, and suspends while the app is hidden. It is never the only feedback channel.

### `shared/capabilities/device.js`

Feature-detected helpers for device orientation, device motion, fullscreen and orientation locking. Permission denial and unsupported APIs return a usable failure value instead of throwing through the application.

### `shared/capabilities/diagnostics.js`

Collects viewport, DPR, FPS, network, visibility, display mode, sensor support, Service Worker state, app-owned storage size, app-owned caches and captured runtime errors.

## Workshop Mode

`shared/workshop-mode.js` and `shared/workshop-mode.css` provide an app-owned diagnostics console.

```js
import { createWorkshopMode } from '../../shared/workshop-mode.js';

createWorkshopMode({
  appName: 'Example App',
  version: '1.0.0',
  cachePrefix: 'example-app-',
  storageNamespace: 'pocket-works:example-app',
  onReset() {
    resetApplicationState();
  }
});
```

Add a visible trigger:

```html
<button type="button" data-workshop-trigger>Workshop</button>
```

The keyboard shortcut is `Ctrl/Command + Shift + W`.

Workshop Mode can:

- inspect live viewport, DPR, FPS, orientation, network and display mode;
- inspect Service Worker state and waiting updates;
- list app-owned cache and storage usage;
- capture `error` and `unhandledrejection` events;
- copy or export a JSON diagnostics report;
- clear only caches whose names start with the configured app prefix;
- reset only localStorage keys inside the configured app namespace.

Destructive actions require a second tap within four seconds. Workshop Mode never uses browser `alert`, `confirm` or `prompt`.

## Offline contract

An application that imports a capability must include it and all of its transitive shared imports in its Service Worker app shell. Pocket Forge currently includes the complete lightweight capability set so Workshop Mode remains available offline.

## Dependency policy

The Quick PWA path remains platform-first and dependency-free. Add a third-party library only when an application has a concrete requirement that the shared modules cannot meet cleanly.

Potential justified choices remain:

- Motion for complex layout choreography and advanced gesture animation;
- Dexie for substantial IndexedDB data models;
- Zod for broad schema validation across many data boundaries;
- Lit for reusable Web Components with isolated rendering.

These belong in an app-specific or Enhanced PWA dependency graph, not in the global runtime by default.
