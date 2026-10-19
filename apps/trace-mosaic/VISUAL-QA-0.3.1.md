# Trace Mosaic — visual & interaction iteration 0.3.1

Date: 2026-10-19. Release: client `0.3.1`. PocketNet protocol: unchanged immutable `v5`.

## Implemented
- Corrected unnecessary lobby rebuilds: server clock (`serverNow`) no longer counts as a content change, keeping controls focused during heartbeats.
- Kept pressed sound switch aligned with the stored on/off setting after every patched render.
- Corrected blocked-cell and valid-cell target styling so an element cannot remain simultaneously in both states.
- Added Escape to dismiss the artwork preview, blocked accidental reentry into a second drag and prevented showing success feedback for a known competing trail.
- Replaced the **first six** procedural gallery images with six distinctly illustrated self-contained SVG scenes, retaining their existing asset paths and puzzle IDs:
  1. Sky Loom — woven celestial ribbons, frame and sky geometry.
  2. Petal Route — winding botanical path, flowers, leaf silhouettes.
  3. Neon Koi — two stylized fish and ripple rings in a deep pond.
  4. Sand Relay — sandstone arches and layered desert dunes.
  5. Moss Beacon — coastal lighthouse, moss hills, water and light.
  6. Prism Orchard — angular prism skies and glass-like fruit trees.
- SVGs explicitly declare 1600×1200 for stable HTML Image dimensions and canvas slicing.
- Added `artwork.test.mjs` verifying size, SVG structure, self containment, and six distinct scene signatures.
- Added real Chromium/WebKit browser QA `qa/atelier-browser.mjs` and QA manifest `qa.plan.json`, with 390×844, 320×568, 844×390 and 1366×768 test viewports.
- Real browser test attempts offline solo, opens and closes artwork reference, toggles sound, drags all sixteen fragment tiles and captures menu, board, reference, first correct placement, and completed results.
- Hooked all tests into the existing `npm run test:trace-mosaic` and Universal Pocket Works QA workflow.

## Verification distinction
Authoritative game rules, snapshots and PocketNet version are unchanged by this visual iteration. The SVG sources were checked for canonical dimensions, balanced grouping, distinct hero motifs, and no external dependencies.

The Universal QA workflow was requested by an issue at:
https://github.com/JustSadSock/pocket-works/issues/1042

**The workflow's completion status and screenshot outcomes have not yet been verified in this review.** Tests should not be reported as passed until the workflow run and artifacts have been inspected. In particular the 16-piece automated drag journey may reveal browser-specific input bugs requiring a follow-up patch.

## Still open
- Real screenshot inspection for overlapping HUD/tray at 320×568 and short landscape.
- Actual multi-user network validation of held drag across frequent concurrent snapshots.
- Replace the remaining 18 original procedural artworks in future authoring passes.
- Accessibility work for keyboard-only piece placement and screen-reader labeling.
