# Trace Mosaic — Artwork Atlas v0.4.0

24 authored SVG puzzles for the restoration board. Previous palette-swapped patterns replaced by differentiated visual narratives; identifiers and paths stay stable across offline saved games.

| ID | Title | Main visual |
|---|---|---|
| 01 | Sky Loom | Celestial ribbons, woven frame and layered terrain |
| 02 | Petal Route | Botanical trail with petal clusters and patterned leaves |
| 03 | Koi Pond | Two koi swimming through concentric pond ripples |
| 04 | Sand Relay | Sandstone arches and layered desert landscape |
| 05 | Moss Beacon | Cliffside lighthouse and coastal moss landscape |
| 06 | Prism Orchard | Glazed geometric trees and floating garden fruit |
| 07 | Celestial Astrolabe | Nested orbital rings, planets and mechanical ticks |
| 08 | Glass Conservatory | Huge greenhouse arch, mullions and exotic plants |
| 09 | Alpine Monastery | Stone mountain sanctuary below snowy peaks |
| 10 | Clockwork Atlas | Nested precision clock, golden needles and gear wheels |
| 11 | Abyssal Jellyfish | Three translucent jellyfish above deep ocean |
| 12 | Crane Flight | Migratory cranes crossing an ochre sun over water |
| 13 | Autumn Rooftops | Multilayered tiled city roofs and glowing windows |
| 14 | Sunset Caravan | Camel caravan moving through desert dune routes |
| 15 | Botanical Folio | Antique natural-history illustration in a manuscript |
| 16 | Ember Mountain | Fiery volcanic ridge, ash and orange lava flow |
| 17 | Fungal Grove | Luminous mushroom forest with varied canopy scales |
| 18 | Northern Lights | Mountain fjord with layered green and violet aurora |
| 19 | Ceramic Dragon | Winding dragon on an antique round ceramic plate |
| 20 | Balloon Passage | Four hot-air balloons floating above sea of hills |
| 21 | Sailing Harbour | Sailboats, dock posts and ripples on coastal water |
| 22 | Chess Labyrinth | Chessboard maze with crowned pieces and winding path |
| 23 | Crystal Depths | Geometric minerals in a crystal cavern |
| 24 | Lunar Temple | Moonlit mountain shrine under a cratered moon |

## Production rules
- Each image is self-contained 1600 × 1200 SVG and uses the existing path `assets/puzzles/puzzle-NN.svg`; no remote images, script tags or fonts.
- Source images are sliced into the authoritative puzzle grid and displayed in their associated catalog palettes.
- Both manifest and authoritative PocketNet version `v6` are synchronized. Immutable versions v1–v5 remain untouched.
- The existing art identifiers and image indices are preserved for compatibility. Names and palettes now identify the corresponding illustration.
- `npm run test:trace-mosaic` includes all 24 XML/geometry tests plus model, transport and visual regressions.

## Verified and open
- All 24 SVGs checked for balanced XML-like tag structure, 1600×1200 sizing and valid path geometry; all 28 prior model/network/visual tests passed in isolated JavaScript execution after metadata changes.
- Real Chromium/WebKit screenshot and full offline drag acceptance are **not yet confirmed**. The QA runner remains `qa/atelier-browser.mjs`, configured in `qa.plan.json`.
- Perceived visual quality and difficult puzzle legibility need evaluation from actual browser screenshots, including 320×568 and 844×390.
