# Skill: Gestures and Direct Manipulation

Load when implementing or repairing any interface controlled by drag, swipe, fling, pull, long press or dismissal gestures: drawers, bottom sheets, cards, sortable lists, sliders, pull-to-refresh, hold-to-confirm, or gesture-controlled game elements. Also load when an interaction lags behind the finger, jumps on release, fights scrolling, dismisses unreliably, or cannot be grabbed again while settling.

This is a Pocket Works adaptation of Emil Kowalski's **Gestures** skill (MIT-licensed), not a dependency or a drop-in React component. Source: https://github.com/emilkowalski/skills/blob/main/skills/gestures/SKILL.md . Use this module alongside `GAME-UI.md` for controls and `MOTION-GAME-FEEL.md` for feedback; those skills cover different concerns.

## 1. Decide whether the platform already solves it

- First prefer accessible, battle-tested primitives already used by the specific app. A bottom sheet is more than dragging: it must handle focus, scrolling, escape, backdrop, nested controls, keyboard input and accessibility.
- Vaul can be a suitable choice **inside an app that already uses React**. Do not add React, Motion or a root dependency to a Quick app just to implement a drawer.
- In plain HTML/CSS/JS, use native scrolling, `<dialog>`, pointer events and CSS transitions where suitable. Write custom gestures only when existing primitives cannot express the required behavior.
- Protect app isolation: libraries, handlers and style changes stay within `apps/<slug>/` unless a separate shared platform change is justified.

## 2. Separate tracking from release

A gesture has two different physical phases:

1. **TRACK**: while the pointer is down, the controlled position follows it 1:1. No easing, transition or spring acts between finger and object.
2. **RELEASE**: after the pointer lifts, continue from the measured position and velocity toward a destination. Use a velocity-seeded spring for interactive custom drags or a well-chosen CSS transition for simpler CSS-only components.

Never use CSS keyframe animations for a surface the user needs to catch and redirect in flight. Release and snap-back must remain interruptible by a new pointer press.

## 3. Tracking implementation

- Keep the pointer's starting position and the element's starting offset. Convert movement into a local delta; do not recenter the item under the finger on the first frame.
- Use `PointerEvent` and `setPointerCapture()` when appropriate. Track one active pointer ID; ignore other touches; finalize or revert on `pointercancel`, `lostpointercapture`, unmount and navigation.
- For Quick apps, write the dragged element's `style.transform` directly, preferably scheduled with `requestAnimationFrame`. For React/Motion apps, use motion values, not React state updates on every `pointermove`.
- Avoid animating inherited CSS custom properties on a parent to move a dragged subtree; that can cause extra descendant style recalculation.
- Preserve responsive geometry. Measure drag bounds from actual element dimensions, and recompute on orientation/resize as needed.
- At movement limits, apply resistance rather than letting the element stop abruptly: e.g. `effectiveOverflow = overflow * 0.2`. Stay inside allowed constraints when settling.
- If a drag contains buttons, text inputs or scrollable content, define a dedicated handle or an explicit no-drag exclusion. Do not steal taps from interactive descendants.

## 4. Release, momentum and dismissal

- Estimate velocity in CSS pixels per second from recent movement samples, not from a single event whose timestamp might be unreliable. Keep the sample window short and discard stale samples.
- Resolve the gesture using **distance OR velocity**. Example starting points: distance of 40–50% of the dismiss travel or a directional flick around 500 px/s; tune to the target, travel distance, scale and user testing. A quick flick must not feel ignored.
- Continue a genuine fling at the release velocity. Returning to origin after a failed threshold should be prompt; an especially slow rollback feels broken.
- Use a small spring bounce only for physically dragged elements. Closing the same sheet by a button, Escape or backdrop should settle without a forced bounce.
- A custom drag that manages the release itself should disable any second, built-in momentum system; never apply competing animations to the same transform.
- Derive backdrop opacity, neighboring content shifts and progress indicators from **the same live drag progress**. They must reverse and interrupt together, not run on independent timers.

## 5. Spatial consistency and intentional gesture areas

- A surface should usually exit along the axis from which it entered. A bottom sheet leaves downward; a card dismisses along the user's swipe direction when meaningful.
- Use `touch-action: pan-x` on a vertical drag handle when horizontal native panning is permitted, or `pan-y` for horizontal gestures. Apply `touch-action: none` only to narrow regions whose gestures truly own both axes.
- Preserve browser scrolling and system navigation: distinguish movement direction before claiming an interaction; do not hijack page scroll or the iOS edge-swipe/back navigation.
- For gestures with a constrained region, avoid triggering on every press inside an entire sheet or card. Buttons and scrolling content must remain usable.
- Do not hide a necessary action behind a gesture alone; provide a visible control or equivalent keyboard action. Escape/backdrop-close, focus return and focus trapping matter for modals and sheets.

## 6. Long press and hold-to-confirm

- A hold progress indicator measures real elapsed time: use **linear** progress during the hold rather than easing its progress.
- If released before confirmation, cancel immediately and return progress with a fast ease-out.
- Cancel on pointer exit when the product requires staying within the target, on `pointercancel`, visibility change or interrupted navigation. Never accidentally confirm on a stale timer.
- Destructive actions still need clear consent, an understandable label and an accessible non-gesture path.

## 7. Performance and accessibility checks

- Test a real touch viewport (Chromium and WebKit) and, when possible, a real device. Mouse-only and trackpad-only verification are insufficient.
- Ensure touch targets are about 44×44 CSS px or larger, including the grab handle and close control. Put hover styles behind `@media (hover: hover) and (pointer: fine)`.
- Track under repeated touches and high-refresh displays; inspect frame drops, style/layout thrashing, nested scroll interactions and fixed-position safe-area behavior.
- Honor `prefers-reduced-motion`: tracking still follows the finger, but reduce or remove momentum, bounce, parallax and decorative follow-through on release.
- Verify one-finger operation, interrupted/restarted drag, reverse direction, quick flick, slow drag, drag beyond limits, a tap without drag, two simultaneous contacts, pointer cancellation, resize and app backgrounding.
- Check keyboard equivalence, semantic labels, focus management, `Escape` and browser Back behavior for modal surfaces, and confirm no invisible interaction blocks the launcher exit route.

## 8. Review and acceptance

Define the gesture's tracked property, allowed axis, distance/velocity thresholds, release target and cancel behavior before implementation. For each shipped gesture, inspect three real frames/states: finger down and tracking; immediately after release; finished or interrupted settle. Use the repository Playwright visual-QA workflow and mobile interaction checks. A gesture passes only when touch remains direct, release is plausible, cancellation is safe, and the UI remains usable without performing the gesture.

If the interaction still stutters, profile writes and frame timing before changing easing curves. If the object jumps on release, check conflicting transforms, stale offsets and duplicated momentum before changing spring constants.
