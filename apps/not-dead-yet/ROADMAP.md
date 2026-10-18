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
- Art direction: personal Soviet-era flat that has accumulated decades of lived-in objects, worn polish, exposed parquet seams, floral wallpaper, rugs, warped family photographs, kitchenware and imperfect window lighting.
- Create authored or modelled higher-resolution assets for doors, lamps, sofas, kitchen appliances, books, picture frames and revolver, retaining light-material mobile LODs.
- True material atlases with albedo/roughness/normal detail, dynamic lamp shadows, curtain motion, non-linear door animations and convincing occlusion.
- Character embodiment: slow first-person gait, old hands/revolver reload and recoil, balance and effort cues, optional reduced visual motion. No default exaggerated shaking.
- Responsive surface materials, impact decals, soft radio hiss, wall knocks, room-specific reverb and positional murmurs. Audio opt-out.

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
