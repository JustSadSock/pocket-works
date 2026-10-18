# NOT DEAD YET — product roadmap (18 October 2026)

## Product promise
A confused, visually impaired elderly protagonist believes he is walking around his own apartment. The space, faces and threats are filtered through unreliable memory and paranoia. The player should recognize ordinary domestic details before those details become uncanny. Diagnoses are not treated as a justification for violence; figures are explicitly ambiguous subjective phenomena rather than a population of dangerous mentally ill people.

## 1.1 — The Apartment, completed chapter
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
