# FOLIO · карманная мастерская

FOLIO is a standalone, offline-first Quick PWA under `apps/folio/`, integrated into the Pocket Works registry through `app.config.json`.

## Main flow

Launch → gallery → create a canvas (portrait, square or landscape) → draw with a finger → change brush/color/layers → undo/redo → automatically save to IndexedDB → return to gallery → reopen or export a PNG.

### Controls

- In Direct and Offset modes one pointer draws. In Precision mode, the leading pointer aims without painting until the other hand holds the draw button. Two pointers pan, zoom and rotate the paper; pinch cancels an uncommitted stroke.
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

## 1.1.0 — Two-hand Precision & desktop

### Touch drawing
- **Точное перо** is the default on phones: the leading finger positions the offset crosshair but never draws on its own.
- Hold **РИСОВАТЬ** with the other thumb to put the nib on paper; releasing immediately finishes the current stroke. Release/hold again to break the line without moving the aiming finger.
- The button is on the left for right-handed users and on the right for left-handed users; handedness is in the brush picker.
- The mode selector cycles `Точное перо`, `Остриё` (draw while moving), and `Прямо` (draw under the finger). Preferences are local to each device layout.
- Two fingers on the paper still zoom, rotate and pan; the independent arm button never counts as a canvas pointer.
- If the draw finger leaves the canvas or the button receives pointer cancellation, drawing stops without leaving stuck pressed state.

### Desktop drawing
- At desktop widths, dedicated **left tool/color rail** and **right brush/layer inspector** surround the canvas; the mobile bottom dock does not consume height.
- Mouse drawing defaults to **Прямо**. A mouse/pen pointer is never artificially offset.
- In **Точное перо**, hold `Shift` while moving with the mouse button down or use the physical on-canvas draw button.
- `Space` + drag / middle mouse = pan, wheel = zoom around pointer, right click = sample color.
- `B`, `E`, `I` = brush/eraser/pipette; `[` and `]` = brush size; `0` = fit; `F` = focus; `Ctrl/Cmd+Z` and `Ctrl/Cmd+Y` = history; `Ctrl/Cmd+S` = persist; `Ctrl/Cmd+Shift+S` = PNG.
- The same IndexedDB work database, brush engine and image formats are used on desktop and mobile. No user account or sync is implied.


Optional precision lock: switch on “Двойной тап закрепляет кнопку” in the brush sheet. Double tap the draw button to latch it; tap once to release. It is **off by default**.

## 1.2.0 — Paint bucket and calibrated nib

- **Заливка** (телефон и ПК, клавиша **G**): коснитесь области на холсте, чтобы заполнить связанный участок выбранным цветом. Заливка работает по видимому изображению с учётом слоёв и бумаги, но изменяет только активный слой.
- **Допуск** заливки 0–100 регулирует, насколько исходные оттенки могут отличаться от точки нажатия. Отпустите перо: для ведра удержание отдельной кнопки не нужно.
- Цвет заливки можно выбрать в палитре, не покидая инструмент заливки. Заливка сохраняется компактным набором растровых строк внутри документа, поддерживает Undo/Redo и PNG-экспорт и не ломает старые документы.
- При добавлении заливки на слой она размещается **под линиями**, чтобы контур оставался видимым.
- В мобильных режимах **Остриё** и **Точное перо** кольцо курсора соответствует размеру кисти на листе с учётом текущего масштаба и типа кисти; рядом указано число пикселей.
- Для пальца теперь единый стабилизированный источник положения для курсора и мазков: фильтрация мелкого шума и ограничение физически неправдоподобных скачков координат.
