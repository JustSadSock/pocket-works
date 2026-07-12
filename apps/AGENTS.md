# AGENTS.md — Native mobile experience rules

These rules apply to every application under `apps/`. They extend the repository-level `AGENTS.md`.

The default expectation is not merely “mobile-friendly web”. Every application should behave like deliberate installed software. Browser-native accidents, page-like behavior and generic web feedback are defects unless the concept explicitly requires them.

## 1. App-shell behavior

- Build around a stable application shell, not a document page with controls placed on it.
- Use `100dvh` and safe-area insets for full-screen apps. Do not rely on `100vh` alone.
- Avoid accidental horizontal overflow at every supported width.
- A full-screen tool or game should normally keep the outer document fixed and give scrolling responsibility to explicit internal regions.
- Use `overscroll-behavior` to prevent browser-like chaining and page bounce where supported.
- Do not allow the body to visibly expose an unstyled background during overscroll, rotation, loading or resume.
- Installed standalone mode and Safari browser mode must both remain usable.
- Detect standalone mode only to refine chrome and spacing; core functionality must not depend on installation.
- Set coherent `theme-color`, Apple web-app metadata, icons and background colors so browser chrome, launch surfaces and the application feel continuous.
- Avoid flashes of unstyled content, abrupt font swaps and layout jumps during startup.

## 2. Eliminate accidental browser behavior

### Text selection and callouts

- Disable text selection on application chrome, controls, canvases, game surfaces, draggable objects and decorative labels.
- Preserve selection in actual reading, copying, code, notes, input, textarea and contenteditable surfaces.
- Disable the iOS long-press callout on non-content interactive surfaces.
- Do not disable copying where text is a meaningful user asset.
- Prevent browser image dragging and ghost previews on decorative and draggable images.
- Set draggable elements explicitly rather than inheriting browser defaults.

A typical baseline may include:

```css
.app-shell,
button,
[role="button"],
.control,
.interactive-surface {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}

input,
textarea,
[contenteditable="true"],
.selectable-content {
  -webkit-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}

img:not(.selectable-content img) {
  -webkit-user-drag: none;
  user-drag: none;
}
```

Adapt selectors to the app instead of blindly copying them.

### Zoom and double-tap behavior

- Do not use double-tap as an interaction unless the user explicitly requests it or the concept genuinely depends on it.
- Prevent double-tap zoom on controls with appropriate `touch-action`, normally `manipulation`.
- Use explicit `touch-action: pan-y`, `pan-x`, `manipulation` or `none` per region. Do not apply `touch-action: none` globally without a reason.
- Full-screen games, canvases and direct-manipulation tools may disable page zoom when zoom would break the interaction model.
- Reading-heavy or accessibility-sensitive apps should preserve user zoom and instead prevent accidental zoom through correct layout, gesture scoping and input sizing.
- Inputs must normally use at least `16px` font size on iOS to avoid focus-triggered page zoom.
- If a canvas/editor disables browser pinch zoom, provide an intentional in-app zoom mechanism when zoom is useful.
- Never allow random viewport scaling after orientation changes, keyboard appearance or repeated taps.

### Context menus and native gestures

- Suppress `contextmenu` only on surfaces where long-press is an app gesture or would produce an irrelevant browser menu.
- Never suppress context menus globally on content that users may need to copy.
- Avoid edge-only gestures that conflict with iOS navigation.
- Do not depend on hover, right click, browser drag-and-drop or a desktop cursor model.
- Do not rely on multi-touch unless it is central to the concept and a one-finger fallback would be inappropriate.

## 3. Touch and gesture quality

- Use Pointer Events as the default unified input model.
- Handle `pointercancel`, lost pointer capture, interrupted gestures and orientation changes.
- Use pointer capture for drags that must remain stable when the finger leaves the element.
- Distinguish tap, drag, long-press and scroll using deliberate time and distance thresholds.
- A finger moving a few pixels must not accidentally activate a tap after a drag.
- Long-press progress should be visible when the action is important.
- Dragged objects should visibly lift, follow the finger without lag and settle into their result.
- Interactive elements must have a clear pressed state within one rendered frame.
- Never wait for `click` feedback before showing that a control is pressed.
- Do not block scrolling with non-passive listeners unless gesture ownership requires it.
- When gesture ownership is required, call `preventDefault()` only in the specific active path.
- Tap targets should usually be at least 44×44 CSS pixels, but visual geometry may remain smaller if the hit area is enlarged invisibly.

## 4. Native-feeling navigation

- Navigation should preserve state and spatial context.
- Define a consistent back behavior for every secondary screen, modal and mode.
- A modal should dismiss predictably through a visible control and, when appropriate, a backdrop gesture.
- Do not use browser alerts, confirms or prompts in finished applications.
- Do not expose raw links, blue underlines or browser-style visited states unless the app is explicitly content-oriented.
- External navigation must be deliberate and visually communicated.
- Avoid unexpected full-page reloads. Update state in place when possible.
- Persist important work before `pagehide`, `visibilitychange` and app suspension.
- Resuming the app should restore the previous meaningful state rather than restarting without warning.
- Destructive actions need undo, recovery or explicit confirmation using an in-app surface.

## 5. Keyboard and focused input behavior

- Account for the software keyboard using `visualViewport` when relevant.
- Focused controls must remain visible and must not be covered by a fixed toolbar.
- Do not resize the entire composition chaotically when the keyboard appears.
- Separate editing mode from navigation mode when complex gestures and text entry coexist.
- Use suitable `inputmode`, `autocomplete`, `enterkeyhint` and input types.
- Avoid automatically focusing an input on launch unless typing is unquestionably the first action.
- Dismiss the keyboard intentionally; do not make users tap random empty space repeatedly.

## 6. Motion quality

Animation is part of interaction design, not decoration added after completion.

### Required characteristics

- Motion must be interruptible. New user input overrides or redirects the previous animation.
- Rapid repeated actions must not queue animations into a delayed mess.
- Animate state continuity: origin, destination, ownership and consequence should remain understandable.
- Use transform and opacity for frequent motion. Avoid animating layout properties in continuous interactions.
- Direct-manipulation motion should follow the finger with minimal filtering and no decorative delay.
- Settling motion may use restrained spring behavior when physicality improves understanding.
- Use velocity-aware releases for swipes, sheets, carousels, sliders and thrown objects where appropriate.
- Button feedback should begin within approximately 16–60 ms.
- Small micro-interactions usually belong around 80–220 ms.
- Medium state transitions usually belong around 180–420 ms.
- Large scene changes may take longer only when the transition carries useful spatial information.
- Never delay data changes, navigation or confirmation merely to finish an animation.
- Ambient animation must stop or reduce when the app is hidden, inactive or under performance pressure.
- Respect `prefers-reduced-motion` and provide a coherent low-motion alternative, not simply broken half-animation.

### Micro-interaction standard

Where applicable, include:

- press depth, scale, displacement, highlight or material response;
- toggle travel and state-color transition;
- counter interpolation or carefully chosen snap behavior;
- drag pickup and drop settlement;
- insertion and removal that preserve surrounding context;
- success, invalid action, blocked action and failure responses;
- mode transitions that visibly establish the new state;
- progress indicators tied to actual work;
- subtle scroll-boundary and limit feedback;
- loading-to-content transitions without layout jumps.

Do not animate everything. Strong motion hierarchy is more convincing than constant movement.

## 7. Audio and haptic feedback

- Treat sound as optional reinforcement, never as the only feedback channel.
- Short interaction sounds should be quiet, distinct and user-disableable.
- Unlock Web Audio through an intentional user gesture before playback.
- Do not autoplay sound on launch.
- The Vibration API may be used as progressive enhancement where supported, but iOS support cannot be assumed.
- Always provide visual feedback equivalent to any vibration or audio cue.
- Avoid adding generic clicks to every action; sound needs a clear role in the product language.

## 8. Standalone PWA polish

- The installed icon, short name, orientation preference, theme colors and launch background must match the app identity.
- Each app needs a coherent first-launch experience without marketing-site onboarding.
- Explain installation only when useful and use platform-appropriate instructions.
- Handle Service Worker updates visibly when stale UI or data behavior could confuse the user.
- Do not silently trap the user on an obsolete cached version.
- Provide an in-app update action when a new version is waiting.
- Offline mode should feel normal, not like an error page.
- Network-only features must disclose their status without disabling unrelated offline functionality.
- Avoid CDN-critical dependencies unless they are cached and have an offline fallback.

## 9. Performance feel

- Perceived responsiveness is a product requirement.
- Input feedback must not wait for storage, network requests or expensive rendering.
- Apply optimistic local updates when failure is recoverable.
- Move expensive calculations away from the input frame; use workers when justified.
- Pause hidden canvases, simulations, audio analysis and sensor loops.
- Adapt canvas resolution and effect density to the actual device frame budget.
- Avoid full-screen blur, excessive backdrop filters and large animated shadows on mobile.
- Prefer graceful reduction of effects over frame drops.
- A visually simpler 60 fps interaction is preferable to a richer 25 fps one.

## 10. Application-feel acceptance checklist

Before marking an app done, verify on a real phone or mobile emulation:

- long-pressing controls does not select labels or open irrelevant callouts;
- repeated tapping does not zoom the page;
- pinch gestures behave intentionally for that app;
- focusing inputs does not unexpectedly zoom or hide the field;
- no accidental image dragging or ghost previews appear;
- the page does not shift horizontally;
- safe areas remain correct in browser and standalone modes;
- keyboard appearance does not cover critical controls;
- press feedback is immediate;
- animations remain coherent under rapid repeated input;
- gestures recover cleanly from interruption and `pointercancel`;
- important state survives reload, suspension and resume;
- offline launch feels like the same product, not a degraded webpage;
- reduced-motion mode remains complete and understandable;
- no browser alert, prompt, dead link or generic web behavior breaks the illusion of installed software.

When accessibility and app-like behavior conflict, solve the interaction deliberately rather than disabling accessibility by default.