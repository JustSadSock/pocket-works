# Trace Mosaic — Visual Atelier 0.3.0

19 October 2026. Primary change: replace the generic frosted-card/mint-neon UI with a *conservation light table* whose centerpiece is the actual playable mosaic and active trace paths. PocketNet protocol and published rules **v5** are unchanged.

## Implemented

### Physical workbench
- Dark mineral background, antique brass and warm ivory material palette, engraved workshop annotations and precise serif / monospaced typography.
- Board is the main object, with inset brass rim, four fasteners, subtly lit ceramic sockets, thin cell seams and tactile fragments.
- Portrait: board above scrollable personal fragments. Desktop: wider board with fragment rail. Short landscape: compact side-by-side.
- Original SVG puzzle gallery retained. New SVG icon aligns with the board geometry and a winding colored trace.

### Input and feedback
- During one gameplay round, authoritative PocketNet updates **patch in place** the field cells, assigned tray, trail overlay, progress and score; `app.innerHTML` is not replaced for every move.
- When image decoding completes after the first network state, existing DOM tile nodes receive their actual textures without replacing the element.
- Dragged fragment lifts visually above mouse/touch; touch has a 66-pixel offset for an unobstructed drop target.
- Each valid/blocked target cell is highlighted differently. Correctly seated locally placed fragments receive a brief overshooting animation after an authoritative snapshot.
- Routes draw as continuous SVG ribbon paths plus dashed centerlines. Fading uses the original 30-second expiry; underlying translucent cells retain collision readability.
- Optional quiet synthesized notes for grab, failed route, correct placement and release. Sound defaults **off**, is saved in localStorage, and can be toggled in the in-game HUD. Vibration is used only on devices that support it.
- “Образец” opens a real picture preview with a visible close control.
- Results become an exhibition screen showing the complete original image, completion, team score, remaining time and each contributor’s statistics.

### Unchanged semantics
- 3–5 players online and solo local practice.
- One player owns a fragment at a time; tile correct-cell checks stay authoritative.
- Blocking paths remain server-validated; they still expire in thirty seconds.
- No changes to `simulation.js`, `server/module.ts`, or the published immutable `pocketnet/module-versions/trace-mosaic/v5.ts`.

## Verified by source-level executable checks
- All previous 20 game/network tests (16 simulation and 4 transport) pass in the isolated test harness.
- Eight additional visual tests cover 3-player/5-player board and tray generation, continuous path geometry, results UI, reference modal, theme/mobile/reduced motion selectors, preserving same-round DOM and late-loaded tile textures.
- `apps/trace-mosaic/visual.test.mjs` is included by existing `npm run test:trace-mosaic` wildcard.

## Pending real browser acceptance
This update does not claim a completed screenshot review. Run the following in the deployed preview or local site with real game entry:
1. iPhone/WebKit 390×844, 360×740 and short landscape 667×375: check safe areas, HUD clipping, board/tray fit and finger visibility.
2. Desktop Chromium at 1280×800 and 1920×1080: verify workbench and material tray remain visible; no inadvertent page scroll during drag.
3. Online three players: hold a tile during frequent peer snapshots and routes, then release on the exact target. The dragged DOM and touch pointer must not be lost.
4. Delayed SVG decode under 3G throttle: the tiles must populate without blank permanent thumbnails.
5. Audio off/on, reduced-motion, archive/reference modal and result transitions. Confirm new icon in Pocket Works.
6. Real five-player match, reconnect, offline restart and update-manager 0.2.1→0.3.0 compatibility.

## Deferred, non-blocking design development
- Editorial art direction for new painterly mosaic illustrations rather than changing original puzzle assets.
- Moment-to-moment physical lighting responding to the lifted tile, optional environmental audio and replay of the most meaningful team routes.
- Full mouse/keyboard accessible tile movement with selectable target cells.
