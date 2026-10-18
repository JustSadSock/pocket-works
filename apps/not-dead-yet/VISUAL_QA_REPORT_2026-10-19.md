# NOT DEAD YET — real-browser visual QA, 19 October 2026

## Test provenance

The full source was checked out by the existing **Universal Pocket Works QA**
GitHub Actions workflow. Unlike earlier V8 function simulations, this run
opened the real PWA in installed Playwright Chromium and WebKit browsers.
Artifacts are preserved for 7 days after execution.

- [Baseline workflow 39170954643](https://github.com/JustSadSock/pocket-works/actions/runs/39170954643) / [QA request #975](https://github.com/JustSadSock/pocket-works/issues/975).
- [Post-fix workflow 39171889336](https://github.com/JustSadSock/pocket-works/actions/runs/39171889336) / [QA request #977](https://github.com/JustSadSock/pocket-works/issues/977).
- [Baseline visual screenshots and report](https://github.com/JustSadSock/pocket-works/actions/runs/39170954643/artifacts/12152890799).

## Confirmed outcomes

| Check | Source | Result |
|---|---|---|
| Baseline Node source and geometry tests | GitHub Actions CPU job | 89/89 PASS |
| Post-fix Node source and geometry tests | GitHub Actions CPU job | 91/91 PASS |
| Real Chromium mobile, 390×844 | Visual suite | HTTP 200, no JS page errors, document width 390 (PASS) |
| Real Chromium desktop, 1366×768 | Visual suite | HTTP 200, no JS page errors, document width 1366 (PASS) |
| Real WebKit mobile, 390×844 | Visual suite | HTTP 200, no JS page errors, document width 390 (PASS) |
| Real WebKit desktop, 1366×768 | Visual suite | HTTP 200, no JS page errors, document width 1366 (PASS) |
| Full interactive 3-project Playwright journey | Baseline and post-fix workflow | Pending review of complete job outcome; do **not** claim passed |
| GPU p95 frame time on real Android/iPhone | No hardware samples | Not measured |

The visual browser suite captured **23 files** including landing screen,
gameplay, pause and ending states in four browser/viewport combinations.
All four reported zero page errors and no horizontal document overflow.
The passing visual suite verifies boot and screenshot capture, **not** that
the art and camera meet the quality bar.

## Defects found by inspecting actual frames

1. **Obstructive instruction toast (high severity on phone).**
   First rendered gameplay frame displayed a large dark desktop keyboard
   instruction across the central upper-middle scene. It especially
   interfered with corridor legibility at 390×844, despite native touch
   controls already being displayed.
2. **Overlarge, angular weapon/hand (high severity on portrait).**
   The first-person forearm and solid block weapon frame covered too much
   of the right side of a narrow phone screen. The rectangular muzzle
   looked like a block rather than a revolver.
3. **Long corridors still visually repetitive (art-direction issue).**
   The screenshots show repetitive thin wallpaper on almost parallel
   corridor walls with relatively little visible domestic clutter or
   silhouette variation. This is a **confirmed art gap**, not a technical
   crash, and is scheduled for the next geometry/material pass.
4. **Device-appropriate input composition (pass with caveat).**
   Touch joystick/buttons fit within 390px with no browser document overflow,
   but the first-person scene's weapon and overlays demand better focal
   balance. Genuine FPS/GPU measurements on real mobile hardware remain
   outstanding.

## Code fixes made from screenshots, v2.1.4

- Do not show desktop WASD hint on coarse-pointer/mobile starts; desktop
  startup help is shorter and transient UI notices sit off-center.
- Compute first-person viewmodel scale from **actual canvas aspect ratio**;
  preserve desktop animation and hit mechanics while shrinking the hand/
  revolver in portrait and lowering it slightly.
- Replace the cuboid steel muzzle with a properly cylindrical, faceted
  revolver barrel and visibly dark bore, without adding weapon firing rules.
- Add browser tests for unobstructed first seconds and a pixel-level
  screenshot-variance gate: the real WebGL screenshot must contain substantial
  tonal structure, rather than passing with a blank canvas.
- Add deterministic Node tests for portrait weapon bounds and finite recoil
  and reload transforms. Split visual-regression spec into its own QA suite
  to allow targeted screenshot reruns.

## Post-fix visual evidence

Post-fix universal visual task in
[run 39171889336](https://github.com/JustSadSock/pocket-works/actions/runs/39171889336)
also passed all four combinations of Chromium/WebKit and mobile/desktop.
[Post-fix screenshot artifact](https://github.com/JustSadSock/pocket-works/actions/runs/39171889336/artifacts/12152632336)
contains the second set of gameplay and UI captures.

Side-by-side observation: the keyboard banner is absent on both mobile
browsers, the hand/weapon occupies substantially less of the portrait
frame, and the new geometry has a less square muzzle. Corridor repetition
remains very noticeable; shader/material and room-layout work is still
needed. Different randomly generated starting seeds mean this is a
composition comparison rather than pixel-for-pixel room A/B.

A dedicated [visual-regression workflow
39172237451](https://github.com/JustSadSock/pocket-works/actions/runs/39172237451)
was started to run screenshot pixel-variation assertions separately
from the longer story / gameplay journey suite. Its result must not be
assumed until that job finishes.

## Outstanding acceptance gates

- [ ] Confirm every new Playwright browser test **passes**, including
      narrow mobile mode, WebGL image variance, seed bookmarks, reload/doors.
- [ ] Review *post-fix* Chromium/WebKit screenshot artifacts side-by-side
      with the baseline photos and verify the weapon actually frames better.
- [ ] Test real iPhone/Android GPU cost and screenshot geometry on hardware.
- [ ] Audit z-fighting around thick wall junctions, frames and doors by
      comparing actual rendered shots while rotating camera.
- [ ] Improve corridor-specific domestic geometry, texture-scale variation,
      fixture placement and believable shadows; do not confuse a passing
      browser screenshot with visual realism.
