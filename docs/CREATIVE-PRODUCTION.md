# Creative production system — Pocket Works

This is a **production loop**, not a visual style guide. It applies to a new app and
to visible redesigns of existing apps. It does not change the Pocket Works launcher.

## Why this exists

Technical templates used to ship a large hero heading, centered stage, outlined
button and accent label. These were implementation defaults pretending to be an
art direction. Agents copied and varied that look across unrelated products.

Visual skills already exist under `docs/agent-skills/`; adding more adjectives
did not change the output. This workflow instead changes the starting point,
requires concrete choices, and creates real browser evidence.

## 1. The product's visual thesis precedes implementation

When you create a new app with `npm run new:app -- <slug>`, Forge generates
`apps/<slug>/visual-direction.json` in **draft** state.

Complete every field before attempting to ship:

- **premise:** a product-specific mood tied to what the player does, not
  “indie”, “beautiful”, “modern”, or a genre label alone;
- **composition:** where the eye lands on a phone and what occupies the screen;
- **shape/material/color/type:** authored silhouette, marks, material, value
  hierarchy and type decisions;
- **signature:** one detail recognizable with the title/logo hidden;
- **distinction:** name the nearest stylistic neighbors in Pocket Works and
  explain a visible difference that a screenshot could prove;
- **production:** which medium produces the important subject most convincingly
  (authored image/sprite, Canvas, DOM/CSS, Blender/GLB, Godot), why, and how
  that asset is made;
- **motion:** the exact action, anticipation, immediate response, follow-through,
  interruption and reduced-motion equivalent;
- **evidence:** one real `click`, `tap` or `drag` with a user-visible result.

Do not invent a style by selecting a preset. Presets are working examples of
an API, **not** examples of acceptable finished interface composition.

## 2. Choose a medium for the focal object

Start from what must look excellent, not which renderer is easiest for an agent:

- **DOM/CSS/SVG:** typography, instruments, vector geometry, interactive
  documents, carefully composed UI and flat illustrations.
- **Canvas:** physically direct drawing, simulation, procedural maps,
  authored textures/layering and pixel-precise gameworlds. Canvas is not
  a reason to draw every person and building as a few circles and boxes.
- **Sprites / authored raster assets:** characters, scenes, scenic texture
  and artwork that procedural Canvas would struggle to depict.
- **Blender + GLB / Babylon / Godot:** volumes, creatures, mechanical
  assembly, lighting and authored animation when spatial depth matters.

Use an existing, well-documented asset pipeline before improvising a cheap
procedural imitation of the hero subject. App-owned files remain app-owned;
never put a product's visual theme in the shared mobile runtime.

## 3. Build one representative screen and one full action

Before multiplying levels, menus or content, finish a **vertical visual slice**:
the first frame, the signature action and the response after it settles.

The motion should show cause and consequence, not a global CSS transition:

1. anticipation (if appropriate to the action);
2. first-frame interaction response;
3. physical change;
4. secondary movement/weight;
5. settle and persistent consequence.

Include immediate feedback for invalid/cancelled actions and reduced motion.
Avoid using continuous sine waves as a substitute for authored poses or
interaction-dependent motion.

## 4. Compare against recent products — no shared art direction

Review at least two existing Pocket Works apps with related function/subject
and one deliberately different visual reference. Describe in
`direction.distinction` what will differ in composition and rendering,
not just palette or corner radius.

Changing purple to green, changing rectangles into round cards or adding
particles to the same Canvas composition **does not qualify** as a new look.

## 5. Real browser evidence before sign-off

Visual evidence is captured with `tests/e2e/visual-direction.spec.ts`.
Set `PW_APP_TARGETS=<slug>` and run with the production-like
`dist-site` / Playwright environment.

For each authored interaction, the test captures:

- `01-first-frame` — opening composition;
- `02-action-press/tap/drag` — input and immediate state;
- `03-settled-state` — result after follow-through;
- the recorded interaction video and the intended consequence.

Playwright cannot rate beauty. The agent **must open the images and video**
and visually review hierarchy, composition, silhouettes, legibility, character,
weight and actual timing. Tests passing without that review is not visual sign-off.

If imagery or motion still feels interchangeable with an existing app,
redesign the biggest visual cause. Do not “polish” generic composition by
adding glow, random textures or excessive microanimations.

## 6. CI and grandfathering

New app PRs and visible redesigns are checked by
`node scripts/validate-visual-direction.mjs --changed`.
Explicit local checks use
`node scripts/validate-visual-direction.mjs --app=<slug>`.

The gate rejects draft answers and missing evidence interactions. For
**new apps**, it also rejects Forge's default monogram icon and stylesheets
that retain most of the starter CSS. The check does *not* claim to score art.

Existing unmodified apps are not invalidated en masse. When changing an
existing app's visual surface, add its visual-direction file first.
Gameplay bug fixes that don't touch visible surfaces remain independent.

The changed-app mobile QA workflow records the proof when a ready direction
exists. Screenshot and video review remains a separate required human/agent
judgment, not a numerical “creativity score”.

## 7. Merge boundary

- Functional core scenario complete, not decorative.
- The signature interaction is real and cancel-safe.
- First frame, action, settled frame and reduced-motion path inspected.
- UI uses the same visual world as the scene.
- No copied launcher/header template, unfinished Forge icon or arbitrary
  generic Canvas objects as the focal subject.
- Reference/anti-reference decisions match the actual visual output.
- App-specific tests, viewport QA and PWA requirements pass.

**A stronger model is useful, but it cannot substitute for an actual
production process and feedback from rendered evidence.**
