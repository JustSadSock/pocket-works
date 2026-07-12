# Screen Lab

Screen Lab is a mobile-first, installable and offline-capable PWA for inspecting real browser and device behavior.

Current version: `1.1.0`.

## What it tests

- Visual viewport dimensions and device pixel ratio
- Safe-area insets for notches, Dynamic Island and home indicators
- Portrait and landscape orientation changes
- Standalone, fullscreen and browser display modes
- Pointer capture, cancellation, drag and multi-touch behavior
- Immediate press feedback from the shared mobile runtime
- Frame-rate sampling
- Online and offline runtime state
- Device orientation input where permission is available
- Reduced-motion preferences

## Interaction

- Move a mouse or tilt a supported device to distort the specimen.
- Tap the status orb to cycle calm, live and wild motion.
- Drag multiple fingers in the touch field.
- Use Impulse, Freeze, Fullscreen and Reset to stress different UI states.

## Shared runtime

Screen Lab is the reference integration for:

- `shared/mobile-runtime.css`;
- `shared/mobile-runtime.js`;
- dynamic viewport and safe-area variables;
- scoped callout, selection and gesture policies;
- `bindPointerGesture()` lifecycle handling;
- immediate `is-pressed` feedback.

Its visual system remains app-owned; the runtime supplies behavior only.

## Offline behavior

The local Service Worker caches the complete app shell and both shared mobile runtime files. After one successful online visit, the application can launch and operate without a network connection.
