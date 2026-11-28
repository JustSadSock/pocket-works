# Living Geography (Genesis 3.3) — unapproved experimental candidate

Field Synthesis is the only live research direction. 3.0, 3.1, 3.2 and Natural Ranges remain available unchanged. Production remains v2; 0.9.0 is not released.

- Separate broad DEM relief (2 km box filter) from residuals. Broad fields retain the original weights; residuals use squared weights. This is an ablation of overlapping-height averaging, not a new generator or a validated regional alignment model.
- CRC32 covers packed little-endian Int16 DEM bytes, including corruption detection on restore. It is an accidental-integrity check, not a cryptographic authenticity guarantee. Original provenance remains intact; legacy saves without packed checksums remain readable.
- Isolated Living material and fine-graph river distance, interpolated lake/coast review source. Detail 4 remains authoritative; local 8/cell interpolation is visual only. No changes to baked renderer architecture or navigation.
- Paired cameras and old/new geometry/material ablations in Chromium and WebKit; full-size memory/restore for 3.2 and 3.3; detail 8 versus locally interpolated detail 4 at one close scene. Legacy hashes and 3.1 hydrology baseline retained. Previous Natural Ranges QA script remains frozen.
- Physical-edge attribution distinguishes actual represented lake crossing, filled depression, fine bed descent/coarse averaged rise and absent crossing evidence; no claim that all mismatches are fixed.
- Short 14-day campaign trials, no 21-world matrix. Art approval requires original screenshots; synthetic checks do not count as art acceptance.

Run: `node apps/crown-and-marches/genesis-living-qa.mjs` (licensed DEM retrieval, Playwright browsers and site server required).
