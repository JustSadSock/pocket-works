# NOT DEAD YET — core roguelike roadmap

## Canonical premise (restored in v2.0)
The PRIMARY game is an endless first-person survival-horror roguelike. An elderly,
partially sighted protagonist with unreliable memory experiences his own small
Soviet/post-Soviet flat as an impossible chain of rooms and tight corridors.
There is no task list to finish and no final entrance door. The player pushes
deeper, finds ammunition, calming supplies and build-changing memories, and
defends against *perceived* monsters. The playable threats are real in the
player's experience; this does not imply that people with psychiatric diagnoses
are dangerous. The environment behind the camera changes after it is left and
unseen: returning does not restore the layout the player remembers.

## 2.0 — Return to the original roguelike loop (implemented)
- [x] Make endless procedural exploration the default PocketWorks entry.
- [x] Keep the existing four-item story as optional `?chapter=1`, rather than
      stripping out its radio, door, blackout, family memory and endings.
- [x] Replace oversized floor plan with connected deterministic sectors:
      one-cell corridors (~1.27m), 2.62m ceilings and small rooms with doors,
      furniture, radiators, curtains, tile, parquet and wall carpets.
- [x] Regenerate previously visited sectors only when distant, behind or outside
      view; preserve seam portals, current player tile and deterministic epochs.
- [x] Infinite growth, increasing danger, enemy chase, actual revolver hits,
      ammo depletion, real reload time, finite composure and permadeath.
- [x] Obtain tea, medicine, bullets and relics. Pick 1 of 3 distinct upgrades:
      steady hand, pockets, breathing, shoes, glasses, rituals or tea routine.
      Every selection changes a gameplay variable; levels are persistent in
      that run.
- [x] Autosave/resume, random seed, records, restart confirmation, pause,
      mobile thumb movement/aim/fire/interact and working audio toggle.
- [x] Reuse existing authored WebGL materials, viewmodel and spatial audio;
      tune sight loss as fog/vignette, partially alleviated by glasses.
- [x] Pure node generation/geometry/memory mutation regressions and browser
      test scenarios; legacy chapter regressions remain routed separately.
- [ ] Validate release with live Chromium/WebKit device screenshots and GPU
      frame times; repository-only tests do not establish mobile performance.

## 2.0.1 — Input reliability (shipped)
- [x] Physical-key WASD, Cyrillic-layout safety, Space fire, Tab inventory,
      Shift sprint, E interact, R reload, F torch, Esc pause.
- [x] Keyboard-only navigation: arrows up/down walk; left/right rotate camera.
- [x] Restore desktop pointer lock from the entire scene instead of allowing
      the mobile touch overlay to swallow half the viewport.
- [x] Fallback drag-to-look for browsers without pointer lock.
- [x] Clear pressed keys on pause/resume/blur, refocus canvas to stop
      buttons from accidentally activating during a run.
- [x] Keyboard regressions + Playwright flows; pending live browser/device CI.

## 2.1 — VISUAL OVERHAUL: The apartment must feel real (NEXT / highest priority)

**Goal:** turn the already functional first-person roguelike into an unmistakable,
tactile, atmospheric Khrushchev-era domestic horror experience. The upgrade
must be visible in a still frame *and* felt while moving. Increase **shape,
physical detail, depth, texture, animation and personality** — not merely
recolor identical rooms or layer post-processing over block geometry. Keep
the lived-in Soviet/post-Soviet setting, tight dimensions and the endless
behind-the-back memory rewrite.

**Non-negotiable art direction:** an ordinary, cramped, imperfectly maintained
flat remembered through an old person's eyes. 1960s–1990s accumulated objects;
cheap manufactured shapes, worn varnish, painted metal, textile, plaster,
mismatched repairs and warm windows against cold corridors. Domestic intimacy
before horror. Distinct irregular silhouettes; not a generic concrete maze,
sterile asset store, neon/glassmorphism, glossy sci-fi or heavy filters
hiding simplistic assets.

### 2.1.0 — Baseline, references and visual grammar (first implementation released)
- [x] Source audit and offline mesh-generation comparison are recorded
      in [VISUAL_BASELINE.md](./VISUAL_BASELINE.md); shader and FOV limitations
      are documented rather than presented as already solved.
- [x] Fixed seeds 222 / 413 / 8787, QA-only scene bookmarks for 7 room types,
      renderer geometry/build/upload counters and Playwright screenshot
      artifact capture flow are implemented.
- [x] First visible mesh detailing: fabric cushions, glass cabinet compartments,
      fridge/wardrobe panel relief, enamel bath/sink taps, teacups, ceiling
      fittings, hall cornices and authentic door trim. 9–11-cell detail LOD.
- [x] Initial 120-seed collision-preservation checks and three-seed geometry
      finiteness/coverage test.
- [ ] Actually run and visually review the reference browser screenshots;
      phone/WebKit and GPU timing are still unverified. Initial scene now
      contains ~18.6k triangles vs ~13.6k before: optimize mesh caching
      and upload spikes before multiplying decoration further.

- [ ] Capture repeatable **before** frames and video: starting corridor,
      kitchen, lived-in room, bathroom, darkness/flashlight, enemy encounter,
      weapon handling and a freshly rewritten room. Fix three seeds and
      one desktop + one portrait 390×844 camera path for later A/B comparison.
- [ ] Audit current architecture: `rogue-scene.mjs` largely uses box
      primitives, `renderer.mjs` shares an offline procedural albedo atlas,
      the camera is 1.54m high with a simple sine bob and fixed 90° vertical
      projection. Record vertex/triangle counts, buffer rebuild frequency,
      shader costs, visual flaws and current frame-time baseline.
- [ ] Establish an **architectural and material style sheet** with scale
      references: door/handle heights, 2.62m ceilings, wall thickness, room
      proportions, authentic furniture proportions, furniture-free traversal
      width, lighting temperatures and palette variation. Use the style sheet
      across procedural seeds and the optional story chapter where shared.
- [ ] Make the game readable without HUD or glowing collectibles: foreground,
      middle ground, distant darkness and familiar shapes must communicate
      space and danger.

### 2.1.1 — Architectural geometry with depth, not a box labyrinth (in progress: 2.1.3 walls)
- [x] Five floor-plan families: four-room, staggered-wing, walk-through,
      service-nook and crooked-vestibule; actual path geometry differs.
- [x] Room footprints shrink to maximum 4×4 cells, with 2-cell WC/pantry.
      Furniture placement follows the doorway, so real collision remains safe.
- [x] Modeled separate toilet; directionally aligned doorframes and thresholds
      replace obstructive decorative leaves. Gameplay cannot interact with
      a door until opening/hinge behavior actually exists.
- [x] Legacy run generator is preserved for old saves (`layoutVersion: 1`),
      while new runs are v2. The memory shift can change the layout family.
- [x] 400 seeded/epoch collision traversals reached every room and reward;
      pure regressions additionally verify all sector seam portals.
- [x] v2.1.2: physical hinged single-leaf doors with 1.5-radian swing,
      embossed wooden panels, handles, actual nearest-door interaction
      (keyboard E / touch), audible door creaks and tactile captions.
- [x] Door collision, AI A* navigation, flashlight/shot LOS and geometry
      all consult the same rotating segment; moving leaf checks its full
      occupied sweep to avoid closing over player or enemies.
- [x] Persist actual door state/angle, clear outdated door states on
      behind-player rewrites, leave old 2.0 save routes fully unobstructed.
- [x] Door regression suite: rotation/orientation, player collision,
      occlusion, safe sweeping, sound-relevant interaction, saved state,
      enemy routing, epoch cleanup, rendered vertices; browser E journey
      authored but not yet run on a real device.
- [x] v2.1.3: create true 155mm thick partitions and 190mm wet-room
      walls; the depth extends into non-walkable tile volumes and does not
      interfere with door collision or reduce walkable corridor width.
- [x] Wall finishes are deterministic across five aged palettes; modeled
      skirting, cornices, irregularly patched wallpaper, exposed conduit
      clips and deep doorway returns increase physical spatial cues.
- [x] Bounded 3-entry `RogueMeshCache` uses fixed 5-cell render anchors;
      backtracking reuses CPU meshes, while new run objects and terrain
      revision changes safely invalidate cache. WebGL uploads reuse the
      existing typed array rather than rematerializing it.
- [x] Regression suite asserts finite bounded mesh output, five material
      variants, wall thickness, cache reuse/eviction and door/collision
      compatibility, including browser QA test authored for return visit.
- [ ] Optimize WebGL buffer uploads when moving between cached regions,
      profile real low-end phones and verify that thick wall corners/wallpaper
      layers look convincing rather than z-fighting in screenshots.
- [ ] Inspect five-family screenshot route in Chromium and mobile WebKit.
- [ ] Add thick partition walls, more differentiated panel profiles,
      deeper architectural connections, wall damage and varied ceiling construction before
      closing the remaining 2.1.1 scope.

- [ ] Generate several credible floor-plan families rather than a repeated
      four-room module: tiny L-shaped halls, vestibules, walk-through living
      rooms, attached kitchens, combined/separate toilets, closets, uneven
      doorway positions and dead-end service nooks. Preserve infinite seams,
      navigability and unseen regeneration.
- [x] Physically model **wall thickness, real door openings, lintels, baseboards,
      ceiling cornices, uneven thresholds, protruding ducts/pipe runs,
      radiators, window reveals, sills and ventilation grilles**. Avoid
      floating trim and walls made of infinitely thin sheets.
- [ ] Add 3–5 wall/ceiling/floor signatures per room family: cracked plaster,
      uneven paint seams, repaired wallpaper, parquet with transition strips,
      old kitchen tile, crooked bathroom panels, Soviet wiring and water pipes.
      The room silhouette must change, not only its color.
- [ ] Doors must have different panel profiles, frames, hinges and handles;
      add actual opening/closing and persistent collision-safe clearance
      before treating any door as interactable. Old story-chapter doors are
      a reference implementation, not a one-off borrowed decoration.
- [ ] Tune generated scale and collision together: no clipping through
      wardrobes, door jambs, sinks, tables or the player's camera; no
      unreachable pickups or trapping after world changes.

### 2.1.2 — Authored, varied and tactile 3D props (P0)
- [ ] Replace recognizable cuboids with identifiable **low-/mid-poly authored
      meshes** with readable curves, bevels, legs, cavities, panels, knobs,
      upholstery, hinges, uneven edges and silhouette-specific details.
      Keep low-cost geometry and LOD variants for mobile rather than simply
      multiplying faces.
- [ ] Build a curated **30–40-prop modular domestic kit**, not 40 color
      variants: wall units, glass cupboards and dishes, TV/radio, couch,
      upholstered chairs, dining/study tables, patterned carpets, beds,
      mattresses, wardrobes, kitchen cupboards, stove, enamel sink,
      refrigerator, toilet, bathtub, mirror, pipes, old switches, light
      fixtures, radiators, shoe racks, coats, family photo frames, books,
      cups, jars, newspapers, medicines, cables and clutter.
- [ ] Per-type shape families and deterministic aging/arrangements: different
      legs, door widths, broken panels, draped fabric, stacked books,
      crockery, scratches and repairs. Make 3 consecutive rooms feel as
      if different people once lived in them; keep selected motifs stable
      across memory changes so unsettling repetition is meaningful.
- [ ] Non-rectangular models for pickups, a more detailed worn revolver and
      convincingly gripped elderly hands. Silhouette/readability must make
      ammunition, tea, first aid and memories recognizable at close range
      without neon beams.
- [ ] Assign collision footprints and placement/orientation to true meshes;
      no visual props blocking corridors without matching `canStand`, and
      no invisible obstacles caused by obsolete bounding boxes.
- [ ] Spatial budgets: combine static geometry by material/sector, remove
      invisible backs where safe, instance/merge repeated small props and
      decimate distant meshes. Retain authored variety within fixed budgets.

### 2.1.3 — Surface materials and genuinely varied textures (P0)
- [ ] Evolve the current offline procedural albedo atlas into a
      **deterministic authored/procedural material library** with UV mapping
      that scales correctly per surface. No stretched floral wallpaper,
      perfectly uniform brown rectangles or checkerboard-like repetition.
- [ ] More authentic material families: faded floral and geometric wallpaper,
      exposed old plaster and paint layers, herringbone/parquet/patched
      linoleum, glossy kitchen ceramic, cracked bathroom tiles, chipped
      enamel, oxidized brass, Bakelite, aged lacquer, glass, velvet, cotton,
      carpet pile and worn bedding.
- [ ] Use object-space edge wear, dirt near floor/ceiling, seams, decal layers,
      water damage and fingerprints where believable. Seed per-room wear so
      unrelated rooms do not look like clones or uniformly damaged sets.
- [ ] Explore normal + roughness information with WebGL1-compatible fallback;
      separate shiny glass/enamel/metal from diffuse plaster and cloth,
      keep atlas/textures local/offline, and measure shader + memory cost.
      Do not claim physically based rendering before it exists.
- [ ] Texture LOD, mipmaps when supported, anisotropy if available,
      consistent texel density and correct gamma/color balance. Avoid blurry
      nearest-neighbor/pixelated images on high-DPI screens.

### 2.1.4 — Light, shadow and convincing spatial depth (P0)
- [ ] Shift from two generic nearby light positions to deterministic
      **fixture-attached, room-aware light placement**: weak hall bulbs,
      window spill, kitchen fluorescence, bedside pools, stairwell glow,
      power loss and a tightly controlled flashlight with useful falloff.
- [ ] Dynamic shadowing of doors, large furniture and figures; first add
      cheap contact/ambient occlusion and wall-aware torch occlusion, then
      benchmark shadow-map / filtered-shadow options with graceful mobile
      fallback. No floating objects or light leaking through closed walls.
- [ ] Respect material response: modest specular cues on enamel, glass,
      metal and wet tile; soft diffuse cloth and plaster; localized reflections
      instead of uniform fake shine. No excessive cinematic bloom.
- [ ] Introduce limited atmospheric layers: dust within light cones,
      breathing air, depth haze and restrained lamp fluctuation. Keep
      silhouettes and interaction targets legible in the dark.
- [ ] The **same room must read differently** under bulb, flashlight and
      near-darkness, without hiding geometry behind a permanent black vignette.

### 2.1.5 — Character camera, movement and first-person animation (P0)
- [ ] Replace the current single sine-wave bob with a **stateful spring camera
      rig**: small footstep-linked vertical/side displacement, gentle
      acceleration/stop inertia, subtle turn follow-through, sprint weight,
      collision/threshold step feedback and optional independent breathing
      motion. Camera movement must not delay aiming or WASD response.
- [ ] Distinctly elderly *physical presence* without caricature: deliberately
      measured gait, asymmetrical footsteps, light hesitation when landing,
      hand/weapon settling and fatigue cues. Gameplay input remains sharp.
- [ ] Correct first-person lens/framing on desktop and tall phones:
      aspect-aware FOV, horizon stability, near-plane clearance, no
      fisheye/distorted doorframes, manageable viewmodel framing and
      flashlight aligned with actual weapon/view direction.
- [ ] Improve revolver actions with shot impulse and recovery, cylinder
      rotation, visible reload phases, hand/finger movement and believable
      muzzle flash; sync visuals with actual `shoot()` / `reload()` timing.
      No phantom second projectile or mismatched damage visual.
- [ ] Contextual object inspection and interaction poses (door handle,
      pickup, lamp/switch) that originate from visible geometry; make
      collectible and interaction response physically understandable.
- [ ] Comfort controls: independent camera-bob/sway intensity and reduced-
      motion mode; no forced head whipping, screen shake from generic
      footsteps, permanent blurred aim or motion-sickness FOV pumping.

### 2.1.6 — World animation, atmospheric FX and audiovisual feel (P1)
- [ ] Animate actual geometry: loose curtains, TV tube flicker, ceiling
      light pendulum, small drawer/door movement, dripping taps, dust
      movement, pipe vibration and small collectible gestures. Vary timing
      by world seed; keep animation independent of mesh rebuild frequency.
- [ ] Enhance silhouettes and creature models for the *current* archetypes
      (coat, figure, crawler) with articulated gait, asymmetrical poses,
      occlusion and believable reactions. Visually telegraph threat vs
      misperceived household object without replacing combat rules.
- [ ] Memory mutation needs a recognizable physical sequence rather than
      a texture pop: subtle off-screen settling, neighboring sound,
      changed furniture relationship and light cue after turning back.
      Never visibly rewrite geometry in the player's forward view.
- [ ] Integrate **foley as part of physical movement**: sole-on-parquet vs
      lino vs tile, creaking boards, revolver parts, cloth, door hinges,
      room-scale muffling and close-distance breathing. Sounds follow
      actual actions/surfaces; remain fully optional.
- [ ] Add disciplined microinteractions — grounded pickup, short
      inspection, weight in doors, subtle visual reaction on enemy hits,
      readable feedback on reaching a new depth. No overlay spam.

### QA pass 2026-10-19 — real-browser visual and gameplay review (v2.1.4–2.1.7 shipped)
- [x] Universal Pocket Works QA executed the real PWA in desktop Chromium,
      mobile Chromium, desktop WebKit and mobile WebKit with full screenshot
      evidence; all four initial viewport/browser visual checks passed.
- [x] GitHub Actions ran the entire app Node regression suite (89/89 before
      fixes, 91/91 after), no suite skipped in the CPU job.
- [x] Reviewed actual screenshots to identify phone center-screen startup
      banner, overlarge blocky gun, and long hallway repetition.
- [x] Removed desktop keyboard instruction from mobile opening, moved
      transient text away from the center, narrowed the portrait weapon rig
      and introduced a faceted revolver barrel/bore.
- [x] Added Playwright first-frame composition, real PNG screenshot pixel
      variance, deterministic room screenshot and cache regression tests;
      isolated the visual-regression suite for targeted reruns.
- [x] Investigate failing real browser traces: nearest pickup priority
      corrected, camera yaw asserted relative to starting heading,
      memory-path test accounts for closed actual doors, and screenshot
      test has a realistic time budget.
- [x] Final independent GitHub CI: 93/93 Node, 12/12 image/visual
      Playwright, 9/9 fast interaction/slow-GPU reload Playwright,
      46 passed + 2 device-conditional skipped in the full gameplay
      journey, 0 failures. [Full audit](./VISUAL_QA_REPORT_2026-10-19.md).
- [x] v2.1.7: actual corridor-mounted ceiling fixtures, enamel electrical
      panels, coat rails and apartment plaques; seeded sparsely by actual
      world cell, invisible collision not added, deterministic mesh
      regressions passed in real GitHub Actions (93/93 Node).
- [x] Separate clock for weapon reloading from capped 100ms physics
      timestep; resolves a regression observed only in full software-GPU
      browser runs. Pixel and input QA now have dedicated fast suites.
- [x] Inspect 60 new actual Chromium/WebKit screens (five seeds × four rooms
      × three browser profiles): corridor lamps and wall objects are visible;
      no visually broken geometry was found in these sampled frames.
- [ ] Align practical lights with actual lighting sources and increase
      recognizable corridor silhouette changes. A pixel crop audit found
      cross-seed corridor pairs with just 4.7–5.2/255 absolute average
      pixel difference, so some seeds still look nearly identical.
- [ ] Address visually repetitive hallways and lighting after fixing
      actual measured art issues, not by adding generic bloom or haze.

### 2.1.7 — Finishing pass, usability and performance (P1)
- [ ] Unify first-person screen composition, reticle, inventory, upgrade
      choices and prompts around **focus-first** UX; fewer simultaneous
      labels, no vertical scrolling during normal phone gameplay and
      no HUD covering the center or weapon.
- [ ] Quality tiers for portrait phones and desktop: limit live lights,
      shadow/filter cost, mesh radius and material detail without changing
      collision, pickup placement, AI, readability or saved worlds.
      WebGL context loss should recover or show a useful error.
- [ ] Add developer visual inspection mode (seed, room/lighting variants,
      collision silhouettes, triangle/draw-call/FPS counters and preset
      camera bookmarks) without exposing debug controls in the ordinary
      experience.
- [ ] Profile geometry generation and GPU upload spikes, not just steady
      FPS. Cache/stream sector meshes and keep deterministic saves intact.
- [ ] Verify fullscreen browser, PocketWorks shell, keyboard/mouse and
      touch controls, 390×844 portrait, landscape and at least one desktop
      resolution. All controls and controls/help copy must stay accurate.

### 2.1 — Acceptance gate before proceeding to combat expansion
- [ ] A/B screenshots/video for the fixed reference seeds and camera route
      show **distinct believable geometry and recognizable object models**
      in every room type; not merely changes in color, post-process or props
      hidden in corners.
- [ ] At least 5 visibly distinct flat/layout families, at least 30
      **silhouette-distinct** prop types, at least 12 surface/material
      families and three interpretable light conditions. Validate counts
      programmatically where possible; review results visually.
- [ ] 100+ generated seeds: no doorway/camera/prop collisions, floating
      furniture, z-fighting, unreachable reward or regenerated sector in
      the player's visible field. Revisit old saves and chapter entry.
- [ ] Input-to-camera responsiveness stays direct; reduced-motion setting
      disables additive motion. No change to shooting, pickup timing,
      flashlight, reload, touch gestures or death/restart functionality.
- [ ] Compare actual GPU/CPU frame timings against the 2.1.0 baseline.
      Optimize for stable 45–60fps where hardware permits; set honest
      device-specific mobile targets from measurements (do not mark
      performance passed on simulated tests alone).
- [ ] Run unit/render geometry regression, browser gameplay tests,
      screenshots on desktop and mobile/WebKit where available.
      No unsupported claim of verified real-device performance.

**Recommended implementation order:**
`2.1.0` reference capture/architecture →
`2.1.1 + 2.1.2` architectural + prop silhouettes →
`2.1.3` materials →
`2.1.4` lighting/depth →
`2.1.5` camera, hands, weapon →
`2.1.6` animation/foley →
`2.1.7` usability/performance/visual acceptance.
Each pass must deliver a visible playable difference and a test, not a
decorative prototype. **No premature rework of the PocketWorks shell.**

## 2.2.0 — Living architectural memory and spatial light (first implementation)

- [x] New runs use versioned `layoutVersion: 3`, with 2–3 true carved
      corridor alcoves per 18×18 sector, sometimes forming two-cell vestibules.
      Old v1/v2 saves are frozen to their original map generators.
- [x] Five types of room-family layout now receive extra architectural
      silhouettes: lowered lintels, wood antresol cupboards, shallow service
      hatches and overhead household rack details, all above player
      collision height. Legacy corridors remain unmodified.
- [x] Original physical room and corridor ceiling fixtures provide the
      two near-field shader light sources; the light sources match the
      actual offline 3D objects instead of arbitrary sector coordinates.
- [x] 48×48 WebGL1 occupancy texture attenuates fixture light across
      concrete partitions and closed physical doors. Mask updates are
      tied to moving between tiles, memory rewrite and hinge animation.
- [x] Fixed procedural cells, sector seams and old save versions verified
      in deterministic 240-seed generator checks and new GPU-test suite.
- [x] First physically located WebGL shader compiled in Chromium/WebKit;
      the 2.2.1 test suite completed 6/6. The costly version caused a
      software-rendered desktop click timeout, so the light occlusion
      algorithm was redesigned in 2.2.2–2.2.3.
- [x] 48×48 CPU lightmap caches concrete/door occlusion, reducing shader
      work to one texture sample per pixel rather than many ray samples.
      v2.2.2 Node CI passed 101/101; real 4-viewport browser visual smoke
      passed without JS errors.
- [ ] Finish and inspect dedicated 2.2.2 CPU-precomputed lightmap
      Playwright screenshots, compare the four-viewport capture against
      baseline and profile real device FPS.
- [ ] Profile shader ray-march cost on real lower-tier mobile GPUs, add
      device performance fallback if necessary.
- [ ] Complete distinct large-scale connections between rooms and
      fixture-controlled on/off switching; current atmosphere changes
      architecture and fixture visibility but does not implement full
      global illumination or physically correct shadow maps.

## 2.2 — Roguelike combat identity
- [ ] Add distinct silhouettes, e.g. ceiling-crawling figure, wardrobe-bound
      pursuer, false family member, with unique clear telegraphs.
- [ ] Interactions beyond damage: proximity, sound, poor eyesight and selective
      light recognition create meaningful costs and counters.
- [ ] More weapons with reload/sway/noise trade-offs rather than pure DPS.
- [ ] Synergy-specific builds, reward risk, enemy archetype-specific balance.
- [ ] 20+ minute procedural-run soak tests and difficulty/loot telemetry.

## 2.3 — Unreliable memory as the main mechanic
- [ ] Non-Euclidean-feeling room changes must remain physically collision-safe,
      not obvious teleports or discontinuous rendering.
- [ ] Track false room recognition and signs of returning to a rewritten place.
- [ ] Allow rare stable memory anchors that survive regeneration as deliberate
      player build choices.
- [ ] Stronger audiovisual perceptual distortion without making controls
      unreadable or treating mental illness as an enemy identity.

---
## Archived milestones (v1.1–1.8)

# 2026-10-18 — authored chapter history

## Product promise
A confused, visually impaired elderly protagonist believes he is walking around his own apartment. The space, faces and threats are filtered through unreliable memory and paranoia. The player should recognize ordinary domestic details before those details become uncanny. Diagnoses are not treated as a justification for violence; figures are explicitly ambiguous subjective phenomena rather than a population of dangerous mentally ill people.

## 1.1 — The Apartment, completed OPTIONAL chapter
- [x] Replace abstract infinite sector maze with a hand-designed four-room apartment, narrow lived-in corridors and the original front door.
- [x] Rebuild deterministic floor graph with seeded room assignments, variable double doors, guaranteed accessible objectives, bounded room mutation and no player trapping.
- [x] Uncouple first-person movement from pointer lock: independent WASD and mobile twin-thumb input, corner sliding, collision diagnostics and recoverable pointer cancellation.
- [x] Replace cyan home beacon with a low first-person pistol model; add procedural wallpaper, wood, textile, enamel, metal, furniture and warm lamps.
- [x] Give the chapter a complete loop: family album, medication organizer, framed portrait and house keys, functional inventory, exit and win/loss screens.
- [x] Equip an old revolver with a six-round drum, limited reserve, reload, sound, aiming and hallucination dispersion. Manage subjective panic rather than video-game flesh damage.
- [x] Store unique randomized run seeds, chapter items, ammo, location and transformed room phases. Make restarting distinct and reversible only by starting a new night.
- [x] Add generation/door/route/persistence regressions and expose movement + collision + rewrite state to test automation.
- [ ] Acceptance on device: physically inspect portrait/landscape Chromium and WebKit screenshots, first interaction to ending, suspend and resume; fix discovered issues before release.

## 1.2 — Physical apartment and animation

### Shipped in version 1.2.0
- [x] A lived-in apartment: carved door frames and shutters, framed windows, drawn curtains, kitchenware, a real ticking clock and more furniture detail.
- [x] Offline authored albedo texture atlas; different deterministic painted materials for aged floral wallpaper, parquet, ceramic tile, linoleum, metal, woven fabric, plaster and wood.
- [x] Small lamp flicker, moving curtains via vertex animation and dynamic clock hands, with no per-frame world mesh regeneration.
- [x] First-person revolver and elderly character hand/forearm gesture: footstep sway, recoil and reload pose rather than whole-camera shake, honoring OS reduced-motion.
- [x] Two differentiated and animated silhouette models: a familiar coat shape and a distant human form with asymmetrical limbs and non-neon facial features.
- [x] Dedicated Web Audio ambient apartment acoustics: surfaces, drum, shot, collectible, wallpaper shift, pipe, clock, radio, heartbeat, sounds toggle in menu and pause.
- [x] Dedicated image atlas and mock-GPU tests, muted/audio-resume tests, four mobile profiles plus functional journey verification.

### Still required before art-complete 1.2
- [ ] Authored high-detail furniture/door models and material roughness / tangent-space normal maps, with lightweight mobile LODs.
- [ ] Dynamic shadow casting (shadows from furniture, doors and player flashlight), reflective window glass, believable day/night variation.
- [ ] Physical swinging interior doors with proper interaction and non-linear animation.
- [ ] Room-aware convolution reverb, positional voice memories and localized high-quality foley rather than synthesis only.
- [ ] Phone screenshots and GPU frame-time profiling to establish a 45–60fps device-specific target.

## 1.3.0 — Soviet apartment physicality (released)
- [x] Fix the setting as a worn Soviet/post-Soviet domestic flat, not generic brutalist hallways: wall-unit and display china, old television, wall carpet, oilcloth, enamel crockery, herringbone parquet.
- [x] Interactive double interior doors with shared collision/render geometry, a tactile open/close action, hinge creak, animated leaves and persisted states.
- [x] Shadow polygons physically projected from real furniture footprints towards room lamps; moving doors and perceived figures cast corresponding floor shadows. This is not full wall-aware shadow mapping.
- [x] Avoid closing on top of the player's capsule; restore previous saves with open leaves.
- [x] Door and route regression tests, mobile interaction feedback and browser QA.

### Rendering follow-up
- [ ] Hardware shadow maps for walls and tall objects with mobile GPU budget validation, soft shadow filtering and directional lamp/torch occlusion.
- [ ] High-quality authored models and more believable reflective glass and translucent cloth.
- [ ] A real apartment layout with additional tighter and individualized rooms and a physically animated front exit door.

## 1.4.0 — Spatial memory and lived-in furnishing (implemented)
- [x] Seeded asymmetric room dimensions, stable shared hall/entrances, safe reachability for all four objectives.
- [x] Explicit `layoutVersion`: previous 1.1–1.3 saves load with their exact legacy geometry.
- [x] Four embodied perceptual disturbances: inverted portrait, doubled kitchen crockery, missing mirror reflection and unfamiliar television.
- [x] Real `E`/touch recognition action near a known physical object, stress recovery, saved remembered-state and a delay until the next rearrangement.
- [x] Higher-detail furnishings: upholstered sofa, fringed Soviet carpet, paneled wardrobe, enamel fridge, foyer shoes and radiator.
- [x] Dynamic-on-rebuild planar silhouettes projected onto plaster walls from high objects and room lamps; no claim of full GPU shadow maps.
- [x] 500 seeded floor-plan regression, legacy save tests, 100 memory/recognition cases and Playwright recognition journey.
- [ ] Physically based soft GPU shadow mapping from torch and every bulb, GPU frame profiling at real device resolution.
- [ ] Narrative triggers with original spoken memories, photograph content variations and a more intricate apartment topology beyond four primary rooms.

## 1.5.0 — A voice in the apartment (implemented)
- [x] Built an actually interactable Bakelite radio with three tuned stations and diegetic moving dial in the furnished living room.
- [x] Synthesized distinct static, nostalgic melody and familiar-message signals offline. Captioned text conveys the memory explicitly; a real voice recording is not yet shipped.
- [x] Family album acts as the clue to understand the familiar channel. This discovery has a one-time stress and world-stability reward, no farming.
- [x] Inventory opens four original family-memory passages and contextual radio / apartment-recall status only on demand.
- [x] Two distinct completed chapter endings: one ordinary escape and a more intimate resolution based on radio discovery plus recognizing two different rooms.
- [x] Persist radio and narrative state in the existing world save, with default behavior for all legacy saves.
- [x] Unit and browser tests for radio accessibility, player interaction, saved tuner, journal and ending decisions.

### Narrative / atmosphere next steps
- [ ] Real performed, locally stored speech recordings (with captions, audio opt-out and size budgets), not synthesized fake dialogue.
- [ ] Multistage domestic tasks that depend on furniture rather than HUD labels; alternative endings with meaningful physical staging.
- [ ] Expand the lived-in flat to a credible landing / neighboring threshold and add location-specific NPC-like memory encounters.

## 1.6.0 — The blackout: household electrical task
- [x] Fixed, recoverable power outage triggered after a meaningful period of exploration; no sudden black game over and no repeat trip after repair.
- [x] Soviet ceramic fuse board in hallway and aging plug-in hotplate in kitchen; both accessible from walkable tile paths across varied room arrangements.
- [x] Two-stage true interaction: unplug hotplate first, then re-engage hall breaker; premature breaker reset refuses with physical sound and in-world clue.
- [x] Radio correctly pauses as an electrical appliance, ambient lamps darken through the WebGL1 fragment shader while battery torch remains available.
- [x] Blackout and restoration have native offline Web Audio, modest tension consequence, saved state and restored availability after reload.
- [x] 500 randomized accessibility checks and an end-to-end browser QA case for power outage/restore.
- [ ] More individualized room circuits, visual switches and dynamic light sources including refrigerator compressor and emergency landing illumination.
- [ ] Hardware contact shadows/normal mapping and profiling on iPhone Safari rather than pretending that planar shadow geometry is shadow mapping.

## 1.7.0 — The neighbor's landing and peephole
- [x] Three diegetic knocks beyond the front door at a meaningful point in exploration (can never farm the event).
- [x] An authored WebGL Soviet shared landing viewed through the brass peephole: elevator, neighbor door, chipped plaster, steps, rail and abandoned grocery net.
- [x] E/touch peephole mode with constrained controls, exit action, camera treatment, and no loss of prior tasks or inventory.
- [x] Family-photo-based recognition, persistent hallway observation, optional stress relief and third distinct chapter ending.
- [x] Notebook continuity, fully local sound cues and deterministic saved-state regressions.
- [x] Room accessibility tests and browser gameplay test for no-shot and recognition/resume.

### Next chapter / technical debt
- [ ] A fully walkable building landing and elevator shaft with physically collidable stair steps, rather than the peephole-only miniature stage.
- [ ] Neighbors represented through believable physical behaviors and ambient sound rather than hallucination-only antagonists.
- [ ] High-quality GPU contact shadows and profile-aware visual-detail adaptation on real iPhone Safari hardware.

## 1.8.0 — Acoustic memory and recognition through light
- [x] Decouple perceived presence behavior from the game loop into a testable module.
- [x] Different sound radii and lifetimes for quiet footsteps, sprinting, shooting, radio, breakers and wooden doors. Closed doors attenuate sound.
- [x] Visible figures respond to the protagonist; unheard ones do not automatically pursue through apartment walls; noises temporarily attract attention.
- [x] Holding the flashlight on a coat or human-like silhouette restores the recognizable domestic object and disperses the apparition without a firearm.
- [x] A shot creates loud acoustic attention and may bring another perceptual figure sooner; shooting is functional but no longer a consequence-free shortcut.
- [x] Localized wooden-floor shuffle sounds, no external audio assets or global health changes.
- [x] Unit tests for perception, line of sight, attenuation, movement and nonviolent flashlight dispersal; browser gameplay checks.

### Still open
- [ ] More substantial environmental acoustic simulation, obstruction-aware reflections and room reverb, beyond basic muffled range and stereo panning.
- [ ] Physically based flashlight shadows cast by furniture and characters rather than only planar projection.
- [ ] Real recorded speech and further multistep domestic puzzle sequences, with mobile-first gameplay QA.

## 1.3 — Memory and perception
- Context-sensitive changes: family pictures reverse, bathroom door leads elsewhere, furniture shifts while unseen, radios recite distorted memories, doors become unfamiliar.
- Explicit safety invariants: all accessible objectives and exit remain reachable; no geometry changes inside view, player capsule, or an occupied prop.
- Threat cast: coat rack mistaken for intruder, moving familiar silhouette, mirror reflection, sound-only figure and false double. Teach recognition through interactions, not diagnosis labels.
- Subtle vision simulation with customizable vignette/blur, audio cues and legible center; accessibility settings that never make the game unplayable.
- Threat AI follows acoustic events and line of sight and can be stopped without shooting; escalation is tension, not a mandatory kills quota.

## 1.4 — Finished narrative/polish
- Spoken memory fragments, hand-authored environmental clues, multi-step tasks, readable journal, diegetic clock and radio, sequence-directed scares, nuanced ending(s).
- Better pause/loading/reconnection-to-PocketWorks shell, explicit save-slot handling, QA menu and comprehensive keyboard/mouse/touch test coverage.
- Profile GPU budgets on iPhone Safari and desktop, adapt geometry/draw distance and material complexity to stable controls.

## 2.0 — Additional maps
- Distinct bounded locations (home, corridor/landing, familiar street, care facility) with shared memory system but different story and topology rather than reskinned infinite corridors.
- Cross-chapter progression, inventory carryover, replay variants and coherent authored narrative transitions.

## Regression contract
No silent blocked movement. No black startup frame. No re-entry to the same random seed on an ordinary new game. No cyan marker in first-person view. No vanishing saved objectives. No overwritten geometry under the character. No non-functional inventory or weapon controls. No newly added faults to the PocketWorks shared shell.
