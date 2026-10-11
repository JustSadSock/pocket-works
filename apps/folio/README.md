# FOLIO · карманная мастерская

FOLIO is a standalone, offline-first Quick PWA under `apps/folio/`, integrated into the Pocket Works registry through `app.config.json`.

## Main flow

Launch → gallery → create a canvas (portrait, square or landscape) → draw with a finger → change brush/color/layers → undo/redo → automatically save to IndexedDB → return to gallery → reopen or export a PNG.

### Controls

- One pointer draws. Two pointers pan, zoom and rotate the paper; pinch cancels an uncommitted stroke.
- **Точно:** visible nib is offset above the finger; the cursor reveals the precise stroke position.
- **Обычно:** the brush follows the finger directly.
- Size and opacity use the lower hand-reachable tool strip.
- Hold a drawn line to straighten it (ink and pencil).
- Long-press the canvas with the pipette tool to pick a color.
- Undo/redo are visible buttons, and Ctrl/Cmd+Z / Shift+Z work with a keyboard.
- Files are stored locally as editable vector stroke documents with individually composited canvas layers. Erasing affects the selected layer, not all layers.

## Rendering and persistence

The view canvas renders offscreen per-layer raster caches, which are re-created from editable strokes; strokes retain native-document positions and style. `indexedDB` holds documents and thumbnails. Export uses a full-size temporary canvas. No network required after first successful cache installation.

## Scope of v1

Professional concepts such as PSD exchange, pixel-grid editing, onion-skin animation and physically simulated wet paint are intentionally not represented as fake tools. They require a dedicated later implementation.

## Testing

`node --check apps/folio/app.js`, `npm run registry:check`, `node scripts/validate-visual-direction.mjs --app=folio`, and the mobile browser quality flow. Real-device Safari and offline-reload verification are needed for final device sign-off.
