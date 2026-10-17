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

## 1.3.0 — Иллюстрированная мастерская / The Little Paint Box

Это полноценное визуальное обновление без изменения формата рисунков, коллекции работ, сохранения или механики ввода.

- Главный экран изображён как лист дорожного скетчбука: акварельная авторская иллюстрация маяка, солнца и гор, живые рукописные пометки, бумажные линии, новый тёплый заголовок.
- В редакторе основная бумага окружена синим рабочим матом; нижний инструментальный пенал получил выразительные кнопки, обозначения и состояния нажатия, а отдельная клавиша точного рисования напоминает физическую кнопку инструмента.
- Для компьютера: отдельные стойки инструментов и кистей выполнены как цветные ящики художника, а сами кисти показывают характерные фактурные мазки.
- Вместо низкоконтрастных серо-бежевых подписей используются тёмные синие чернила на кремовом и солнечно-жёлтом, либо светлые надписи на синем. Основная оранжевая кнопка дополнительно затемнена для читаемости.
- Реальные кнопки, меню, слои, заливка, точное перо, шаблоны листов, PNG и сохранение остались на месте; меню действий и пустые состояния получили новые тексты, опасное подтверждение выделено отдельно.
- Авторский значок sketched sheet and brush strokes, SVG без удалённых ресурсов. Небольшие анимации солнца и гербовой звезды отключаются при `prefers-reduced-motion`.

## 1.4.0 — Контуры, быстрые линии и курсор ПК

- **Повторная заливка**: повторный клик меняет цвет предыдущей заливки, поскольку источник границ теперь составляется только из нарисованных линий и активных видимых контуров, а не из ранее нанесённого цвета. Внутри одного слоя новые заливки ложатся поверх предыдущих заливок, но ниже штрихов. Другие слои доступны для определения границ.
- **Пересечения линий**: небольшие разрывы контура закрываются морфологически без увеличения толщины самой линии; заливка слегка заходит под непрозрачные пиксели границы. Благодаря этому на пересечениях не остаются случайные светлые трещины. `Порог контура` регулирует, насколько полупрозрачная линия считается границей (больший порог пропускает слабые линии).
- **Быстрое рисование**: сглаживание чувствительнее к скорости: при быстром движении нет накопления искусственного отставания, а координата из `pointerup` всегда включается в штрих. `pointermove` учитывает и coalesced samples, и конечное событие. Предыдущее автоматическое упрощение длинных штрихов после паузы убрано.
- **ПК**: курсор мыши/графического пера при работе кистью или ластиком заменён кругом фактического диаметра кисти на экране с учётом масштаба и вида кисти. Кольцо обновляется при изменении размера, зуме, переключении кистей и возвращении курсора.
- `fill-engine.mjs` — независимый тестируемый модуль расчёта областей; тесты находятся в `tests/fill-engine.test.mjs`. Сервис-воркер кэширует этот модуль офлайн.

## 1.6.0 — Общее полотно / PocketNet + Pocket Cloud

- Из альбома нажмите **Рисовать вместе**, выберите формат и создайте комнату. Отправьте участникам 8-символьный код или ссылку вида `/apps/folio/?room=XXXXXXXX`. Гость по ссылке входит через ту же вкладку/приложение, обновив FOLIO до 1.6.0.
- **До 6 художников** могут наносить штрихи на один общий слой. Сначала мазок отображается немедленно локально, затем частичные штрихи передаются другим участникам с ограниченной частотой; по отпускании кисти сервер подтверждает окончательную геометрию и единую последовательность действий.
- Авторитетный PocketNet Durable Object хранит ревизию рисунка; идемпотентные IDs предотвращают двойные штрихи. Случайный пропуск ревизии восстанавливается снимком. На временном обрыве связи незавершённые локальные действия сохраняются в очереди вкладки и повторно отправляются после восстановления комнаты.
- **Отменить / Повторить** управляет только собственными последними действиями, не стирая работу друзей. Заливка передаётся компактными вертикальными группами строк, как и кисти/ластик, и остаётся редактируемой в локальном документе.
- После входа полная копия общего документа оказывается в локальном IndexedDB каждого участника. Изменения записываются в альбом автоматически; при действующем Pocket ID Pocket Cloud загружает редактируемую копию в **личное облако** каждого художника. Никакого общего постоянного облачного пространства/публичной ссылки на проект не заявляется. Гостям доступна локальная копия.
- Два вида совместимости: устоявшийся FOLIO JSON-формат рисунков не мигрируется и не меняет старые проекты; сетевые правила зафиксированы в `pocketnet/module-versions/folio/v1.ts`. Новые версии клиентов должны поддерживать v1, а будущие несовместимые правила обязаны добавлять v2 snapshot, не редактируя v1. Старые клиенты без этой функции не могут присоединиться к новой комнате.
- Ограничения текущей инфраструктуры PocketNet: **комнаты временные**, бездействующие комнаты очищаются сервером приблизительно через 30 минут; лимит игрового снимка 256 KiB, входящего пакета 16 KiB, серверный предел общей работы ~175 KiB. Слишком тяжёлые заливки/штрихи отклоняются с понятным сообщением, а локальный документ сохраняется; файлы в Pocket Cloud ограничены собственной квотой сервиса. Для продолжительного редактирования сохраните личную копию и создайте новую комнату.
- Работа офлайн и одиночный режим прежние; новая кнопка доступна независимо от авторизации, PocketNet использует гостевую или Pocket ID сессию. Для тестов: `node apps/folio/test-collab.mjs`, `npm run build:pocketnet`, Edge smoke + браузеры iOS/desktop.
