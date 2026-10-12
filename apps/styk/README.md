# СТЫК — тактика живого фронта

A standalone offline-first medieval WEGO tactics game under Pocket Works \`apps/styk/\`. Game loop is complete: select a friendly standard, tap a destination or drag the two visible endpoints of its formation, choose a stance, execute simultaneous orders, respond to line collapses, and complete three campaign battles against an enemy commander. No grid, no external CDN, no PocketLAN coupling.

## Design

The main interaction is **drawing a deployable line** with two handles. Wider lines cover ground but lose density. Narrow lines are stronger at the point of contact and more exposed to flanks. Nearby allies stabilize a line; a nearby routing formation spreads panic.

Visual direction: a living miniature war table with painted grass, rivers, hill contours, trees, standards and independently drawn soldiers. Dark, patinated field-command console; not parchment cards and not flat unit rectangles.

## Controls

- Tap blue formation/standard to select.
- Tap ground to set a new formation destination; drag the center to move it precisely.
- Drag either luminous endpoint to resize/rotate the intended front.
- Choose Hold, Advance, Charge or Withdraw.
- Two modified formations per turn, persistent orders, then Execute.
- During resolution, toggle 1×/2×. Menu pauses in all phases.
- Keyboard: Enter to resolve; 1–4 stances; Esc menu.

## Simulation

\`core.js\` is deterministic and DOM-free. Contact uses distances between line segments, effectiveness depends on soldier count, morale, cohesion, density, relative bearing and terrain. Bowmen shoot by range; cavalry pursues exposed archers; AI chooses targets each round. Routed formations no longer fight and cause morale shock to adjacent allies. Battle ends on collapse or a scenario turn limit.

## Storage and offline

\`pocket-works:styk:campaign-v1\` persists unlocked chapters and current planning-state battle. Partial turns are not serialized while animation is playing; a reload resumes at the last completed order phase. Service worker owns only \`styk-v1.0.0\` and supports offline reload. The app uses Pocket Works mobile runtime and update manager.

## Limits / intentional scope

The first release is **solo versus AI**, not a claimed PocketNet room. Networked 1v1 needs a separate authoritative server module and synchronization design to prevent divergent battle states. No inactive PocketLAN imports are present. Current soldier motion is programmatic Canvas drawing, not third-party character assets.

## Smoke verification

\`node --test apps/styk/tests/core.test.mjs\`

Production quality gate: \`npm run registry:check\`, \`npm run deploy:site\`, mobile Chromium/WebKit visual and interaction passes.
