# Interface & Interaction Overhaul — research candidate 01

## Scope and preservation
War Against Men baseline 52616ce0b23424240eca1d71f606b181c4c1976f: PocketNet Edge run 45592303925 passed 10/10 (including WebKit 2v2), Universal QA, AI Mobile Gameplay and Godot Web Runtime passed. Validate failed Creative Direction (missing recent Pereves comparison, now reviewed in this candidate) and unrelated Petlya-17 Chromium landscape acceleration. Production Packaging, Health and Lighthouse passed. Do not mark production ready. No changes to engine, saves, main gameplay UI, server protocol, or immutable network runtime. This candidate is a separate research route inside the same app, not a separate launcher app and not final 0.9.0.

## Audit
Original artifacts: 14984887362 visual, 14985630099 journey, 14984777005 performance, 14984733542 network, 14985491188 chronicles. Entry action below seven controls, horizontal overflow of order tray, map occluded by administrative panels, similar unit markers, nested modal historical command, native multiple select for allied allocation, dropdown round selector. Prior group order measured 4 actions in large historical scenarios (not equivalent to this ordinary four-regiment prototype). Prior 60 regiment round Chromium 554 ms and WebKit 622 ms; 158 1.86/1.91 s. Do not extrapolate these to prototype render performance.

## Reference research
- https://linesofbattle.wiki.gg/wiki/Quickstart_Guide — spatial lines and facing, explicit mode conflict avoidance.
- https://linesofbattle.wiki.gg/wiki/Update_1.8 — group frontage, preservation of formation, undo; keep existing order model.
- https://academy.totalwar.com/category/armies/ — group translation without losing formation.
- https://apps.apple.com/us/app/ultimate-general-gettysburg/id913585516 — map-first command and paused strategy.
- https://forum.slitherine.com/viewtopic.php?t=19482 — contextual unit actions and information.
- https://prod-paradox-hub.paradox-interactive.com/games/crusader-kings-iii/news/ck3-console-dev-diary-3-uiux-and-controls — contextual layers and adaptation to alternative input.
- https://www.feralinteractive.com/en/faqs/companyofheroes/1.0.2/ios/ — adapting control methods for touch.
- https://www.loc.gov/collections/military-battles-and-campaigns/about-this-collection/ — cartography as terrain, communications and movement. No external artwork copied.

## Prototype
Open research/overhaul/prototype.html within Banners source site or as standalone local HTML. A = mineral editorial atlas and contextual dock; B = darker miniature scene, horizontal selection rail on portrait, bottom-right dock desktop; C = schematic command table with coordinate grid and left dock desktop. Same actual Greyford initial data, exact sampled river and roads, elevation/land classes at 50 m (coarse prototype, not authoritative terrain borders), original engine dimensions and force counts, initial/30s recorded result. Standalone export drafts and inspect two actual states; served route imports existing engine and can resolve new 30-second rounds. No network or production save writes. Group selection, explicit box/lasso, camera pan/pinch, route/front, endpoint edit, formation, conditions, undo/redo. Deployment is a draft preview, not actual repositioning yet. Actual 3D miniature detail, all mode integration, large-army performance, historical fog, and human evaluation are not claimed. Selection: provisional A with B's visual richness; C useful analytic inspiration, not a competing final control system. No design signoff yet.

## Local Chromium measurement (not human data)
390x844 touch CDP, 1440x900 desktop, 844x390 touch CDP; 9/9 passed local scenario. Each group task = group, front, gesture (3); start 2 actions. Time is automated interaction elapsed, includes deliberate test waits and browser driver. Map free share approximates rectangle union of top, rail, camera and dock, excluding smaller legend/hint. 
| concept | portrait expanded/compact | desktop expanded/compact | landscape expanded/compact |
| --- | --- | --- | --- |
| A | 64.1/80.1% | 79.0/86.6% | 57.8/70.7% |
| B | 63.2/79.3% | 83.4/88.7% | 58.2/71.4% |
| C | 61.5/78.4% | 80.9/85.8% | 53.4/66.5% |
Ordinary front: portrait 434–435 ms, desktop 295–300 ms, landscape 435–436 ms. Formation 4–10 ms; undo 28–97 ms. No page errors in those scenarios. WebKit unavailable in local environment; repo Playwright tests include actual WebKit/Chromium. Not a human usability claim. Landscape compact does not meet 75% target. Three concepts share spatial grammar and renderer, not yet independent complete artistic production directions. Do not reuse previous cosmetic 0.9 candidate as final design. 
