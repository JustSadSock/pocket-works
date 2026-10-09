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
