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

## Completed full Playwright journey evidence

[First journey 39170954643](https://github.com/JustSadSock/pocket-works/actions/runs/39170954643)
ran 54 planned tests across mobile Chromium, mobile WebKit and desktop
Chromium: **47 passed**, **4 failed**, **1 flaky**, **2 skipped**.
The failures were not a false "everything passed" result:

1. The all-seeds 20-screen visual test hit the default **45 second**
   timeout on Chromium even though the screenshots themselves could
   be captured. Its own test timeout was increased to 180 seconds.
2. An upgrade test teleported to a relic but interacted with a nearby
   medicine because nearDrop chose items in sector-generation order.
   This was a genuine interaction bug. Gameplay now selects the nearest
   visible object, with a deterministic ID tie-break, and QA asserts
   the active target before interacting.
3. The keyboard test required absolute yaw > 0.3 even when the starting
   camera had already rotated. QA now checks the positive angular delta.
4. The procedural-memory test assumed closed physical doors never
   obstruct a route, which is incorrect gameplay behavior; it opens
   those real doors before testing permanent sector connectivity.

[Second full journey 39171889336](https://github.com/JustSadSock/pocket-works/actions/runs/39171889336)
ran 55 checks, **53 passed, 2 failed**. Its remaining failures
were both in the optional story chapter's mobile-WebKit controls:
a frame-stale ammo assertion immediately after tapping Fire, and a
hinged door which did not close when tapping Interact. Those were
recorded for targeted chapter-input tests and must not be marked fixed
without a repeat run.

**New v2.1.5 checks**
- [Focused visual-regression run](https://github.com/JustSadSock/pocket-works/issues/981),
  [targeted journey run](https://github.com/JustSadSock/pocket-works/issues/982).
- Both runs are newly requested after fixing the nearest-item gameplay
  selection and screenshot matrix timeout. Their outcomes must be
  checked before marking this milestone green.

## Follow-up test results and model-driven fixes

- [Visual-regression 39172949932](https://github.com/JustSadSock/pocket-works/actions/runs/39172949932):
  **12/12 real Playwright tests passed**. This includes screenshot capture
  for deterministic sector bookmarks, bounded CPU mesh reuse, first-frame
  focus and actual screenshot luminance variance in mobile Chromium,
  mobile WebKit and desktop Chromium.
- [Power/camera smoke 39174955391](https://github.com/JustSadSock/pocket-works/actions/runs/39174955391):
  **6/6 tests passed**. Fuse and hotplate use correct priority; right-arrow
  camera turns in the expected direction; Escape returns to live play.
- [Geometry, power, weapon and hallway CPU regressions 39175555758](https://github.com/JustSadSock/pocket-works/actions/runs/39175555758):
  **93/93 passed**, including deterministic sparse corridor fixtures and
  10-float WebGL vertex ABI validation.
- [Full gameplay suite 39174534979](https://github.com/JustSadSock/pocket-works/actions/runs/39174534979):
  **44 passed, 2 failed, 2 skipped**. The failed reload checks on
  mobile WebKit and desktop Chromium exposed a *real* regression:
  capping `simulation(dt)` to prevent gigantic camera steps also made
  a 1.55-second revolver reload advance too slowly when software WebGL
  rendered fewer frames. Fixed in **v2.1.7** by using two clocks:
  maximum 100ms game-physics step and the real active frame duration for
  reloading. Exposed both as `simulationFrameTime` and `fpsFrameTime`.
  The post-fix journey must be evaluated separately.
- [Scoped interaction acceptance run 39174955391](https://github.com/JustSadSock/pocket-works/actions/runs/39174955391)
  was expanded with a simulated 650ms browser main-thread stall to verify
  reload time in addition to fuse, camera and pause. This new test is
  not included in that older 6/6 result.

### Quantitative screenshot diagnostics

In gameplay screenshots from the 2.1.4 review, sampling the middle image
region (23–77% horizontal, 27–70% vertical) produced these raw 8-bit
luminance values:

| Screenshot | Mean luminance | Standard deviation |
|---|---:|---:|
| Chromium portrait (390×844) | 174.8 | 22.9 |
| WebKit portrait (390×844) | 158.5 | 14.7 |
| Chromium desktop (1366×768) | 132.1 | 58.9 |
| WebKit desktop (1366×768) | 126.0 | 52.4 |

These are diagnostic samples from **different randomized rooms**, not a
calibrated display measurement or matched scene A/B. The mobile captures
show substantial low-frequency bright wall surfaces, with fewer visually
readable anchors than desktop. This informed the next art pass: sparse,
distinct low-poly objects integrated into **real corridors**, including
ceiling lanterns, electrical switchboards, coat rails and apartment number
plates. The objects do not affect collision or room regeneration logic.
Their actual screenshot appearance must be reviewed in the newest visual
run, not inferred from CPU mesh tests.

### Remaining verification

- [Post-hall-geometry screenshot suite 39175557084](https://github.com/JustSadSock/pocket-works/actions/runs/39175557084)
  (request #991): check final job status and inspect new artifacts.
- [Post-reload interaction suite request #992](https://github.com/JustSadSock/pocket-works/issues/992)
  and [full gameplay suite request #993](https://github.com/JustSadSock/pocket-works/issues/993):
  check outcomes before calling the release fully validated.
- Test real mobile hardware under load. GitHub CI uses software/virtualized
  browser rendering, not the user's GPU.

## Validated v2.1.7 snapshot

- [Hallway and image-quality screenshot suite 39175557084](https://github.com/JustSadSock/pocket-works/actions/runs/39175557084)
  **12/12 passed in Chromium and WebKit**.
  [Captured artifact](https://github.com/JustSadSock/pocket-works/actions/runs/39175557084/artifacts/12154153224)
  contains **60 reproducible scene screenshots**: 5 seeds × corridor,
  bathroom, kitchen and living room × mobile Chromium, mobile WebKit and
  desktop Chromium, plus the additional QA screenshots.
- Examined a contact sheet of all 15 corridor bookmarks: the seeded
  ceiling lights, switch boxes and occasional rail/door plate now have
  meaningful visible volume and change the composition across layouts.
  The hall geometry is still simplified: no wall/fixture-accurate bounced
  light, dedicated normal maps or comprehensive GPU occlusion.
- [Post-stall interaction suite 39175830656](https://github.com/JustSadSock/pocket-works/actions/runs/39175830656)
  **9/9 passed**, including the previously failing clock-sensitive reload
  under an intentionally imposed 650ms main-thread stall.
- [Geometry and gameplay Node suite 39175555758](https://github.com/JustSadSock/pocket-works/actions/runs/39175555758)
  **93/93 passed**, including new corridor material mesh tests.
- [Long-form post-fix journey 39175833714](https://github.com/JustSadSock/pocket-works/actions/runs/39175833714)
  is the remaining independent end-to-end gate; its completion should be
  checked before claiming *all* suites have passed.

## Final CI closure — v2.1.7

All scoped suites are now independently confirmed green on GitHub Actions:

| Scope | Github Actions | Result |
|---|---|---|
| Full game journey, inventory, doors, story, saves and controls | [39175833714](https://github.com/JustSadSock/pocket-works/actions/runs/39175833714) | **46 passed, 2 deliberately skipped, 0 failed** |
| Deterministic CPU/material/geometry tests after publishing v2.1.7 | [39176418513](https://github.com/JustSadSock/pocket-works/actions/runs/39176418513) | **93/93 passed** |
| Actual WebGL image/room screenshot tests, post-hall-fixture change | [39175557084](https://github.com/JustSadSock/pocket-works/actions/runs/39175557084) | **12/12 passed** |
| Short high-signal power, keyboard, reload-under-GPU-stall scenarios | [39175830656](https://github.com/JustSadSock/pocket-works/actions/runs/39175830656) | **9/9 passed** |

Two browser tests were conditionally skipped in the full cross-device
journey. They were not counted as passes.

### Additional visual similarity audit

A one-off numerical review sampled a common cropped center region of the
actual post-fix corridor screenshots for all 5 deterministic seeds.
For each browser project, the cropped pixels were resized to 64×64 RGB
and mean absolute per-channel pixel difference (0–255) was computed for
each of the 10 cross-seed pairs.

- Mobile Chromium: smallest difference **5.0/255** (seeds 413, 8787);
  median difference **24.1/255**.
- Mobile WebKit: smallest **5.2/255** (413, 8787), median **21.3/255**.
- Desktop Chromium: smallest **4.7/255** (222, 14), median **17.85/255**.

The test does **not** imply these runs share the same underlying physical
map; it shows that two procedurally different layouts can still produce
almost identical *visible corridor compositions*. This is an outstanding
art-direction limitation, despite successful new fixture geometry and
five underlying room-family designs. The next work should vary
architectural silhouette, junction patterns, door prominence, clutter
composition and **fixture-attached light placement**, not merely repaint
the same corridor layout with another pastel shade.

## Outstanding acceptance gates

- [x] Confirm initial visual Playwright browser tests **pass**, including
      narrow mobile mode, WebGL image variance, seed bookmarks, reload/doors.
- [x] Review *post-fix* Chromium/WebKit screenshot artifacts side-by-side
      with the baseline photos and verify the weapon actually frames better.
- [ ] Test real iPhone/Android GPU cost and screenshot geometry on hardware.
- [ ] Audit z-fighting around thick wall junctions, frames and doors by
      comparing actual rendered shots while rotating camera.
- [ ] Improve corridor-specific domestic geometry, texture-scale variation,
      fixture placement and believable shadows; do not confuse a passing
      browser screenshot with visual realism.

## v2.2.0 — Geometry and practical lighting experiments

The preceding 2.1.7 checks apply to that release, not automatically
to 2.2.0. The new layoutVersion 3 adds actual connected walkable
corridor niches and high-up alcove structures while keeping original
sector boundary portals intact. Legacy saves keep versions 1 or 2.

Two closest relevant lights originate from actually modeled room shades
and opal hall lights. The shader uses a 48×48 wall/hinge occupancy texture
and twelve fixed intermediate samples per light ray, with
`structureEnabled=0` for the separate story chapter and revolver
viewmodel. This is an inexpensive WebGL1 occlusion approximation;
full bounced lighting or PCF soft shadows are not claimed.

Testing requested through universal PocketWorks QA:
- [New 2.2.0 Node architecture regression](https://github.com/JustSadSock/pocket-works/issues/1010)
- [New 2.2.0 visual/browser shader suite](https://github.com/JustSadSock/pocket-works/issues/1011)

Individual conclusions must be recorded after the runs have actually
finished. Isolated deterministic JavaScript validation passed 37
focused tests on new and existing scene/door/lighting modules.

### v2.2.1 — first actual Playwright findings

The first new WebGL1 shader run
[39230314384](https://github.com/JustSadSock/pocket-works/actions/runs/39230314384)
compiled the shader and completed **5/6 Playwright scenarios** in
Chromium and WebKit. The remaining test hit Playwright's default **7-second
screenshot timeout** on software-rendered **desktop Chromium**, including
its retry; the error did not report a shader compile or JavaScript
exception. The new pipeline renders more expensive than the old flat
shader because it checks masonry occlusion along actual lamp rays.

Two mitigations were pushed:

1. Scene pixel ratio cap lowered from 1.3→1.2 on narrow/mobile and
   1.6→1.4 on desktop to reduce software-GPU pixel cost.
2. Number of occlusion-mask texture samples per light ray bounded to
   **6 portrait / 8 desktop**, instead of 12.
3. Full five-seed screenshot matrix uses a scoped **45-second screenshot
   timeout** and 240-second test budget so slow screenshot encoding does
   not masquerade as broken 3D geometry. This does not hide missing
   light masks, WebGL errors or invalid map assertions.
4. In frozen visual reference mode, door opening tests advance the hinge
   explicitly rather than waiting for gameplay time to resume.

Retest via [visual shader issue #1015](https://github.com/JustSadSock/pocket-works/issues/1015)
and [CPU issue #1016](https://github.com/JustSadSock/pocket-works/issues/1016).
A separate [four-viewport smoke visual check #1013](https://github.com/JustSadSock/pocket-works/issues/1013)
tests startup and image capture. All follow-up outcomes need verification,
and software-emulated rendering cannot stand in for physical device GPU p95.


### v2.2.2 — resolving the software-GPU stall

The first optimized *still ray-marching* shader subsequently passed
[6/6 real Playwright lighting scenarios](https://github.com/JustSadSock/pocket-works/actions/runs/39231535622),
but the four-viewport visual smoke check
[39231023376](https://github.com/JustSadSock/pocket-works/actions/runs/39231023376)
revealed a **desktop Chromium 7-second start-button click timeout**.
In that report the app had loaded and JS errors were empty; the
software GPU was consuming too much frame time for a dependable
interactive test. This is a real responsiveness risk, not just a
timeout threshold problem.

The rendering design was therefore changed:
- A CPU-computed 48×48 RGBA light-visibility texture is updated only
  on player tile changes, door threshold changes or a memory rewrite.
- The WebGL1 fragment shader makes **one texel lookup per fragment**
  instead of walking 6–12 occlusion samples for each of two lamps.
- Both practical lights are still attached to real 3D ceiling fixtures,
  and walls/closed hinges still stop their illumination.
- A single isolated V8 lightmap build took about 3 ms at seed 222.
  This is a microbenchmark only, not mobile GPU frame rate.
- [Real GitHub Node regression on 2.2.2](https://github.com/JustSadSock/pocket-works/actions/runs/39232633677)
  passed **101/101** tests including additional CPU texture-visibility
  checks across a closing/opening physical door.
- [Post-redesign WebGL Playwright](https://github.com/JustSadSock/pocket-works/actions/runs/39232638773)
  and [four-viewport visual smoke](https://github.com/JustSadSock/pocket-works/actions/runs/39232641393)
  are the remaining shader performance validation gates.

A review of actual early 2.2.0 phone screenshots also exposed overly
bright beige ceilings and an unnatural blue-green weapon barrel.
The shader got restrained practical-light and flashlight intensities
with a mild tone-mapping shoulder; the weapon iron/sleeve pigments
were neutralized. A fresh screenshot A/B review is still required.
