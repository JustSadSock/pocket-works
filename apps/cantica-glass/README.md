# CANTICA III — Книга света

A portrait, offline-first Gothic glass puzzle in Pocket Works, with 500 deterministic stages and a completely rebuilt manuscript-native interface.

## Play and chapters

The core stained-glass window, illumination physics, hints, keyboard tile controls and saves are unchanged. Outside the window, the interface is restrained stone, bronze and wax. The main navigation is a physically presented medieval book.

Open **Книга окон** on the lower plinth. A full-screen vellum folio unfolds with ten separately named volumes. Each volume has an illuminated initial, bespoke symbol, progress, lock state and highlighted current book. Each of the ten volumes contains 50 puzzle windows, divided into two large pages of 25 medallions. Medallions show completed/current/available/sealed status. Navigate via page buttons, left-right swipe or keyboard, then tap an unlocked medallion to jump directly into that actual puzzle. Escape first returns to the catalogue and then closes it.

Completing windows 50, 100, and so on through 450 unlocks the next book with a special illuminated victory sheet and a direct **Открыть новую книгу** action. Completed books and unlocked windows remain available. Window 500 ends in the final completion sheet.

## Art and motion

Hand-authored gilded ornamental SVG, quiet cinnabar rubrics and thick mottled parchment replace HTML cards. The manuscript's edges, spine, paper stack and full-screen opening are physically modelled with CSS; folio flips use perspective rotation and settle naturally. The game HUD becomes a dark stone framing with a wax-seal hint button and low-chroma type. Optional page rustle belongs to the existing sound toggle. Reduced-motion, safe-area insets, keyboard focus, accessibility labels and compact screens are supported.

## Integrity

- Release 3.0.0 on 2026-10-09.
- The existing puzzle-save key remains pocket-works:cantica-glass:save-v2.
- All 500 deterministic levels and their routes remain unchanged.
- The offline scoped service-worker cache now includes the new manuscript.js and ornaments.svg assets.
- Pocket Works exits are preserved in both gameplay and codex.

## QA

- node --test apps/cantica-glass/tests/logic.test.mjs
- node --test apps/cantica-glass/tests/manuscript.test.mjs
- node --check apps/cantica-glass/app.js
- node --check apps/cantica-glass/manuscript.js
- npm run registry:check
- node scripts/validate-visual-direction.mjs --app=cantica-glass

The manuscript tests cover ten volumes, locked states, 25-level pages, page turning, dismissal and final-level selection. Device visual QA is needed to confirm accurate paper sizing and legible details on target phones.


## 3.1.0 — coherent chapel playfield

The puzzle artwork itself remains intact: this release rebuilds the architecture surrounding it instead of repainting every tile. A shared geometry module (`playfield-layout.js`) computes the arch crown, square mosaic, stained rose, solar centre, stone jambs, altar outlets and raised sill from the available screen rectangle. The independent pieces no longer disagree or clip each other on different phone heights.

- The painted rose and the draggable sun are now the **same physical object**. A small refracted ray links its central jewel to the actual entry column, including on even-sized boards.
- Gothic springers, shafts with capitals, an inset recess and a full-width stone ledge replace free-floating lancets and ornament glyphs.
- Touch coordinates, relic locations and glass drawing use the same returned layout, across board sizes 4–7.
- The outer UI is materially quieter: shorter manuscript title, smaller progress ribbon, carved stone score sill, custom line-drawn book/restart insignia and a rounded stamped-wax hint button.
- The extra vertical space on tall devices is distributed symmetrically; shorter portrait devices prioritize glass instead of retaining hardcoded empty padding.
- Saved puzzles remain under `pocket-works:cantica-glass:save-v2`; the 500-level generator and chapter manuscript are unchanged.

### Geometry regression

Run `node --test apps/cantica-glass/tests/playfield-layout.test.mjs` to check 396 viewport/level-size combinations and 500 generated layouts. The other two existing suites continue to cover puzzle routes and manuscript navigation.

## 3.2.0 — adaptive chapel workbench

The same glass puzzle now has a two-column chapel workspace for landscape
tablets and desktops, a wider portrait tablet experience, and a scroll-safe
landscape phone layout. The app/PWA now permits both screen orientations.
Larger stage areas allow tiles up to 120 CSS pixels (previously 96).

Pointer hit testing uses the same `fitChapel` layout as the renderer. Touch
up must land on the initially pressed tile; interrupted gestures and a second
finger do not rotate the wrong glass. Mouse right click turns anticlockwise;
WASD and arrow keys select panes, Enter and Shift+Enter rotate them.

Additional regression coverage:
- `node --test apps/cantica-glass/tests/*.test.mjs`
- `node --check apps/cantica-glass/app.js`
- `node --check apps/cantica-glass/input.js`

Responsive design targets: 320×568 / 390×844 portrait phones, 667×375
landscape phone, 768×1024 portrait tablet, 1024×768 landscape tablet, and
1440×900 desktop. These are code/test targets, not manual screenshot-QA results.

## 3.3.0 — The stained-glass journal, real rewards and new soundscape

The static desktop tutorial was removed: the side rail is an actual journal
of server-confirmed completed windows, the next progression milestone and
earned profile collectibles. On phones the four main actions are levels,
hint, rewards and restart; the full-screen illuminated reward manuscript
is always reachable without permanently shrinking the window.

CANTICA now has nine genuine Pocket ID achievement entitlements: four
collectible titles (including the legendary one), the lunar chapel card
background, rose-window portrait frame, solar circlet, shoulder crystal and
illuminator robe. Those items are rendered and equipable in the shared
PocketWorks MASKOT/profile editor. Server profile writes reject locked IDs.

Solo achievements use a replay receipt: the client records the sequence
of pane rotations with level and layout variant, Pocket Social independently
generates the deterministic puzzle and replays every move until the
solution is achieved, then records unique levels and mints account-bound
items. A repeated receipt cannot double-count a window. The client queues
receipts from an authenticated session for later sync if connectivity
drops. Older incomplete saves without a rotation history remain playable
but cannot produce a retrospective server-verifiable receipt for that
attempt; restart a window to build a fresh receipt.

Original WebAudio effects include glass/metal rotation, reverse, newly
lit relics, sun drag, vellum page rustle, hint bells, restart, victory
chord and a separate achievement flourish. Existing sound preference is
preserved; newly installed local saves default to sound enabled and can
be muted at any time.

QA:
- `node --test apps/cantica-glass/tests/*.test.mjs`
- `node --test scripts/test-pocket-social.mjs`
- `node --check apps/cantica-glass/{app,rewards,soundscape}.js`
- `node scripts/validate-visual-direction.mjs --app=cantica-glass`

Note: achievements depend on connected Pocket ID. Guest and offline-only
play still save the core puzzle locally but cannot mint profile entitlements
without an authenticated, server-verified completion.
