# Pocket Works Visual Agent Skills

These modules are mandatory visual-production guidance for repository agents. They are intentionally split by discipline so an agent can load only the guidance relevant to the task instead of carrying one giant aesthetic prompt.

They synthesize proven patterns from public agent skills and practitioner workflows, then adapt them to Pocket Works constraints. They are not vendored copies.

## Loading rules

For any task that creates or materially changes visible output:

1. Read `VISUAL-DIRECTION.md`.
2. Read the task-specific modules:
   - `CANVAS-2D.md` for Canvas 2D, procedural illustration, sprite rendering, or top-down 2D scenes.
   - `GAME-UI.md` for HUDs, menus, overlays, inventory, dialogue, controls, onboarding, and other in-game UI.
   - `MOTION-GAME-FEEL.md` for animation, transitions, VFX, hit feedback, tactile response, camera response, or sound-linked motion.
   - `3D-SCENE.md` for WebGL/Babylon/Godot scenes, authored models, lighting, materials, camera composition, or environmental dressing.
3. Read `VISUAL-QA.md` before final sign-off.
4. Existing product identity and explicit user direction override generic taste advice.

## Shared operating principle

Do not ask "what modern style should I use?" Ask "what visual world makes this product legible, memorable, and appropriate?" Then encode that world into concrete rules: palette, typography, shape language, material treatment, density, motion, texture, camera/layout, and interaction feedback.

## Public influences

The guidance was synthesized from:
- Anthropic's public `frontend-design` skill.
- Impeccable by Paul Bakaus, especially its distinction between product operation, visual craft, audit, polish, layout, motion, and responsive adaptation.
- Community UI/UX agent-skill patterns that separate design tokens, accessibility, layout, typography, motion, and visual QA.
- Public game-development agent skills covering game feel/juice and browser-game UI.
- Practitioner reports from Claude/Codex users: use concrete references and anti-references, define tokens before broad implementation, keep art data separate from game logic, constrain palette and dimensions for procedural/pixel art, and use screenshot review instead of trusting code-only completion.

Do not treat any one external skill as authoritative. Pocket Works product requirements, repository constraints, device targets, and the user's brief come first.
