Original prompt: Create a beautiful low-resolution 16-bit fighting game inside Pocket Works, with a distinct arcade cabinet identity, two replaceable starter characters, and an emphasis on mechanics.

Visual thesis: A late-night dockside arcade cabinet. Warm vermilion metal, cream typography, cool petrol water, amber lamps. Wide stage with chunky hand-authored pixel fighters; clean DOM menus and compact edge HUD. No generic dashboard, neon gradients or glass panels. A stamped versus title and short impact freezes give the cabinet its personality.

Implementation: Phaser 3 handles the fixed-resolution scene and textures; a deterministic independent simulation handles startup/active/recovery, blocking, projectiles, meter, AI and best-of-three rounds. Art/character definitions stay replaceable.

QA complete:
- TypeScript, production build and 9 combat-rule tests pass.
- Chromium desktop (1280×900), Chromium phone landscape/portrait (844×390, 390×844), and WebKit in both phone orientations pass real gameplay, CPU match completion, rounds, rematch, menus, pause/resume, selection/sound persistence and error checks. Screenshots were visually inspected for menus, combat, jumping, specials, pause, round/result and portrait composition.
- The reference develop-web-game client ran against source and the final stamped production preview; its gameplay screenshot and serialized state were inspected.
- An isolated production-like site was assembled with the actual prepare-site pipeline; validate-site passes. All five browser gameplay runs also pass against the stamped release.
- Chromium verifies a true offline reload of the stamped production release. Windows WebKit's offline/navigation interception fails before its service worker can respond; its QA report explicitly records that limitation and verifies complete precache contents instead.
- Fixed production URL cache aliases (pw_release/pw_fp) and cached the shared boot guard plus real release metadata under app-owned namespaces. This prevents offline release checks from leaving an unstyled, unbooted page.
- Root registry:check passes. Broad validate:all encounters pre-existing missing/mismatched manifests and cache metadata in other apps; no app-specific error points at afterhours-arena. The existing normalization tests additionally assume UTC; setting TZ=UTC resolves their unrelated local-time assertion. Neighboring apps/platform files were not changed.

Future work: replace the cast's texture/portrait layer from family references; add authored sprite sheets and character-specific moves. Multiplayer is outside this starter version. The simulation, fixed frame anchors and texture lookup are kept independent to make those replacements straightforward.
