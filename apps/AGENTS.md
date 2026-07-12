# AGENTS.md — Native mobile application rules

These rules apply to every application under `apps/` and extend the repository-level `AGENTS.md`.

The default target is installed-software behavior, not merely a responsive website. Browser accidents, page-like feedback and generic web interaction are defects unless the concept explicitly needs them.

## 1. Shared mobile runtime contract

Every new app must adopt the shared runtime unless a documented technical reason makes it impossible.

Required HTML wiring:

```html
<link rel="stylesheet" href="../../shared/mobile-runtime.css">
<main class="app-shell" data-app-shell>...</main>
```

Required JavaScript wiring:

```js
import { installMobileRuntime } from '../../shared/mobile-runtime.js';
installMobileRuntime();
```

Required Service Worker shell entries:

```js
'../../shared/mobile-runtime.css',
'../../shared/mobile-runtime.js'
```

Use the provided semantic attributes rather than duplicating global browser fixes:

- `data-app-shell` — stable application shell;
- `data-ui` — non-selectable interface chrome;
- `data-native-press` — immediate press-state utility;
- `data-pressable` — custom pressable element;
- `data-app-control` — app-like link/control behavior;
- `data-gesture-surface` — app-owned gesture region with `touch-action: none`;
- `data-touch-action="pan-x|pan-y|manipulation|none"` — explicit gesture ownership;
- `data-block-callout` — suppress irrelevant long-press menus only on that surface;
- `data-selectable` or `.selectable-content` — preserve copying and selection;
- `data-native-drag` — explicitly opt an image back into browser dragging;
- `data-keyboard-aware` — include runtime keyboard inset in bottom spacing;
- `data-fullscreen-app` — full-screen shell with controlled overscroll.

Available JavaScript helpers:

- `installMobileRuntime()`;
- `getViewportState()`;
- `bindPointerGesture()`;
- `capturePointer()` and `releasePointer()`;
- `setDocumentScrollLocked()`.

The shared runtime owns behavior only. Do not turn it into a common visual theme, component library or source of app-specific colors and geometry.

## 2. Application shell

- Build around a stable application shell, not a document page with controls placed on it.
- Use `var(--app-viewport-height)` and runtime safe-area variables for full-screen layouts.
- Do not rely on `100vh` alone.
- Avoid accidental horizontal overflow at every supported width.
- Full-screen tools and games should keep outer-document movement controlled and put scrolling in explicit internal regions.
- Use scroll locking only while a modal, sheet, canvas mode or other interaction genuinely owns the viewport.
- Never expose an unstyled body background during overscroll, rotation, loading or resume.
- Safari browser mode and installed standalone mode must both work.
- Standalone detection may refine spacing and chrome, but core functionality must not depend on installation.
- Keep `theme-color`, Apple metadata, icons and launch background coherent with the app identity.
- Avoid layout jumps, font flashes and abrupt startup reflow.

## 3. Eliminate accidental browser behavior

### Selection, callouts and dragging

- Disable selection on controls, app chrome, canvases, draggable objects and decorative labels.
- Preserve selection for reading, copying, notes, code, inputs, textareas and contenteditable surfaces.
- Suppress iOS callouts and context menus only on surfaces where they are irrelevant or conflict with an app gesture.
- Never disable copying when text is meaningful user content.
- Decorative images must not create drag ghosts. Use `data-native-drag` only when native dragging is intentional.

### Zoom and repeated taps

- Do not use double-tap as an interaction unless explicitly required.
- Controls must use `touch-action: manipulation` through the runtime.
- Assign `pan-x`, `pan-y` or `none` only to regions that truly own those gestures.
- Never apply `touch-action: none` to the entire document without a full-screen interaction reason.
- Inputs must render at least 16 CSS pixels on iOS to avoid focus zoom.
- Reading-heavy apps should preserve deliberate user zoom.
- Full-screen games and direct-manipulation tools may restrict browser zoom when it would break the mechanic; provide in-app zoom when useful.
- Orientation changes, keyboard appearance and repeated taps must never leave the viewport randomly scaled.

### Native gesture conflicts

- Avoid edge-only gestures that conflict with iOS back navigation.
- Do not depend on hover, right click or desktop drag-and-drop.
- Use multi-touch only when central to the concept.
- Never use global `contextmenu`, `touchmove` or gesture cancellation when a scoped surface is sufficient.

## 4. Touch and gesture quality

- Use Pointer Events as the default unified input model.
- Prefer `bindPointerGesture()` for drags and custom gesture surfaces.
- Handle `pointercancel`, lost pointer capture, interruption, app suspension and orientation change.
- Use pointer capture when a drag must remain stable after the finger leaves the element.
- Distinguish tap, drag, long-press and scroll with deliberate distance and time thresholds.
- A moved finger must not activate a tap after a drag.
- Important long-press actions need visible progress.
- Dragged objects should lift, track the finger without decorative lag and settle clearly.
- Press feedback must appear in the first rendered frame; do not wait for `click`.
- Use non-passive listeners and `preventDefault()` only on the active gesture path that needs them.
- Touch targets should usually be at least 44×44 CSS pixels; invisible hit-area expansion is allowed.

## 5. Navigation and focused input

- Preserve state and spatial context across screens and modes.
- Every secondary surface needs predictable back and close behavior.
- Every game must provide an explicit text-labelled control that returns to the Pocket Works launcher from the initial menu, pause menu and completion or game-over screen. An icon-only header control, browser back gesture or hidden edge gesture is not sufficient.
- Do not use browser `alert`, `confirm` or `prompt` in finished apps.
- Avoid raw blue links and visited-link styling unless the app is content-oriented.
- External navigation must be deliberate and communicated.
- Avoid unexpected full-page reloads.
- Persist important work before `pagehide`, `visibilitychange` and suspension.
- Resume into the previous meaningful state instead of silently restarting.
- Destructive actions need undo, recovery or an in-app confirmation surface.
- Use runtime `visualViewport` variables when the software keyboard affects layout.
- Focused controls must remain visible above fixed toolbars and the keyboard.
- Do not let keyboard appearance resize the composition chaotically.
- Use appropriate `inputmode`, `autocomplete`, `enterkeyhint` and input types.
- Do not autofocus on launch unless typing is unquestionably the primary first action.
- Provide an intentional way to dismiss the keyboard.

## 6. Motion and micro-interactions

Motion is part of interaction design, not decoration added at the end.

- Motion must be interruptible; new input overrides or redirects current animation.
- Rapid actions must not queue into delayed animation debt.
- Preserve origin, destination, ownership and consequence across transitions.
- Use transform and opacity for frequent motion.
- Direct manipulation should follow the finger with minimal filtering.
- Use restrained spring settling and velocity-aware releases only where they improve comprehension.
- Press response should begin within roughly 16–60 ms.
- Small micro-interactions usually belong around 80–220 ms.
- Medium state transitions usually belong around 180–420 ms.
- Never delay data changes or confirmation to finish animation.
- Pause or reduce ambient motion while hidden, inactive or under performance pressure.
- `prefers-reduced-motion` must produce a complete low-motion experience.

Where applicable, implement:

- press depth, displacement, scale, highlight or material response;
- toggle travel and state-color transition;
- drag pickup, movement and drop settlement;
- insertion and removal that preserve surrounding context;
- success, blocked, invalid and failure feedback;
- visible mode transitions;
- progress tied to real work;
- subtle boundary and limit feedback;
- loading-to-content transitions without layout jumps.

Do not animate everything. Strong hierarchy is more convincing than constant motion.

## 7. Audio, haptics and performance feel

- Sound reinforces interaction but is never the only feedback channel.
- Sounds must be quiet, distinct, user-disableable and unlocked by an intentional gesture.
- Do not autoplay audio.
- Vibration is progressive enhancement; iOS support cannot be assumed.
- Always provide equivalent visual feedback.
- Input feedback must not wait for storage, network requests or expensive rendering.
- Prefer optimistic local updates when failure is recoverable.
- Move expensive work away from the input frame; use workers only when justified.
- Pause hidden canvases, simulations, sensors and audio analysis.
- Adapt canvas resolution and effect density to the real device frame budget.
- Prefer a simpler 60 fps interaction over a richer 25 fps effect.

## 8. Standalone PWA quality

- Icon, short name, orientation, colors and launch background must match the app identity.
- First launch should feel like opening software, not arriving on a marketing page.
- Explain installation only when useful and with platform-appropriate instructions.
- Offline mode should feel normal, not like an error fallback.
- Network-only features must disclose status without disabling unrelated local functionality.
- Cache shared runtime files and all offline-critical assets.
- Never silently trap the user on a stale cached version; Phase 3 will provide the shared update manager.

## 9. Acceptance checklist

Before marking an app done, verify on a real phone or mobile emulation:

- long-pressing controls does not select labels or show irrelevant callouts;
- repeated tapping does not zoom controls or shift the viewport;
- pinch behavior is intentional for the product;
- input focus does not zoom unexpectedly or hide the field;
- decorative images do not produce drag ghosts;
- no horizontal page shift appears;
- safe areas work in browser and standalone modes;
- the keyboard does not cover critical controls;
- press feedback is immediate;
- rapid repeated input does not break animation state;
- gestures recover from `pointercancel` and lost capture;
- important state survives reload, suspension and resume;
- every game exposes a working text-labelled route back to the Pocket Works launcher from start, pause and completion states;
- offline launch feels like the same product;
- reduced-motion mode remains complete;
- no browser alert, prompt, dead link or generic web behavior breaks the application illusion.

When accessibility and app-like behavior conflict, solve the interaction deliberately rather than disabling accessibility by default.
