# AI-agent visual production: evidence-based medium selection (2026-10-12)

This document augments `VISUAL-INTELLIGENCE.md`, `UNIVERSAL-ART-FORGE.md`, `CANVAS-2D.md` and `CREATIVE-PRODUCTION.md`. It does **not** assert that AI can automatically generate finished professional illustrations. Use the existing app-local Art Bible + Forge manifests, never a shared house style.

## 1. Practical reverse engineering: what tends to survive a code agent

| Medium | Reliable with precise constraints | Fragile / likely to underdeliver | Pocket Works route |
| --- | --- | --- | --- |
| Grid-authored pixel art | 16–48 px silhouettes, limited indexed palette, low-frame pose families, spritesheets, icons | Smooth anatomically accurate character animation, free-form complex hand painting, changing scale/lighting between frames | `pixel` v2 adapter; `pixelorama` if verified available; nearest-neighbor runtime |
| Geometric SVG | Pictograms, heraldry, emblems, interface ornaments, bold flat silhouettes, scalable buttons | Complex human/animal anatomy, textured painterly scenes built from hundreds of generic paths | `vector` adapter, authored SVG retained |
| Layered 2D collage | Consistent foreground/midground/background planes, masks, overlays, game board environments | Pretending procedural circles are an authored hero illustration | `raster` layers and deterministic masks |
| Stylized 3D | Hard-surface props, low-poly dioramas, isolated machines, authored light and baked orthographic sprites | Character facial acting, many complex rigs, realistic anatomy/skin, arbitrary cinematic worlds | Blender Asset Forge with editable `.blend` and verified `.glb`; `bake` for 2.5D |
| Canvas/WebGL procedural | Lighting masks, terrain patterns, beam cones, particles, shaders, physically meaningful motion | Replacing all key art with placeholder primitives, unbounded texture noise | Game renderer, with hero assets from Forge |

These are **engineering hypotheses and observed production failure modes**, not a benchmark of image-model rankings. The right medium depends on the asset's visual job.

## 2. Research and developer evidence

- **Aseprite documentation** (https://aseprite.org/docs/basics/, https://www.aseprite.org/docs/animation): animation is a time sequence of editable layered cels. Preserve consistent frame size, tagged action ranges, durations, pivots.
- **Aseprite community, solo animation, 2026-01-18/21** (https://community.aseprite.org/t/what-kinds-of-2d-pixel-animation-approaches-would-work-well-for-a-solo-developer/27932): practitioners recommend low sprite resolution, key poses first, moving unchanged body regions instead of full redraw, fewer shades and modular assets for efficiency. Community advice, not controlled research.
- **Hack Club Pixl guide** (https://pixl.hackclub.com/docs/pixel-art): silhouette, fixed light direction, tight palette, export at 1× and upscale with pixelated sampling.
- **SpriteLab guide, 2026-10-08** (https://www.sprite-lab.com/guides/how-to-make-pixel-art-sprites-for-games): lock pixel grid, scale, palette and outlines; generated imagery needs real pixel-grid cleanup; check in-game size. Vendor-authored, treat claims as workflow advice.
- **GamineAI, May 2026** (https://gamineai.com/blog/how-to-make-pixel-art-with-ai-for-games): AI is useful as early visual exploration; clean export requires pivots, tile seams, palette and manual consistency decisions. Vendor-authored and not independent evidence.
- **Wayline sprite guide** (https://www.wayline.io/learn/pixel-art/4): validate silhouettes at native display scale and remove detail that collapses when moving.

The conclusions below are the Pocket Works synthesis, not quotations or copied guidelines.

## 3. Mandatory agent workflow

1. **Choose three distinct directions**, including a deliberately cheaper medium. Record exact visible differences and rejected alternatives in `art-bible.json`. Reject any idea dependent on an unavailable tool.
2. **Lock the visual contract first:** logical viewport, sprite cell (e.g. 32×32), object-to-cell ratio, lighting direction, 8–24 active colors with named roles, outlines, frame anchors, rendering order, texture budget and preferred authored poses. Keep a single hero/reference asset.
3. **Draw the hero as silhouette before shading.** At 100% target phone size it must distinguish playable entities and affordances. Ensure pose differences also survive high-action playback.
4. **Use the Forge contract, not screenshots as source.** Keep editable per-app sources, v2 jobs, outputs/provenance/checks, and a deterministic fallback only if explicitly planned. No pretending a filename or JSON manifest is an actual exported texture. Query `forge.py capabilities`; missing editor means blocked job, not silent replacement.
   **Production/runtime path invariant:** Pocket Works deliberately excludes `apps/<slug>/asset-forge/**` from `dist-site`. Never `fetch()` or precache an `asset-forge/` source from the shipped game. Only load exported `assets/...` paths (and their committed `forge-index.json`) in the runtime. Check this using the production `prepare:site` output and an offline browser boot, not only the repository dev server.
5. **Anchor animation, do not randomize it.** For an action: anticipation / contact / impact / recovery. Use stable origin and pivot. Drive sparks, camera impulse, sound and highlights from the same semantic impact event. Avoid every-frame noise, gratuitous sine waves and perpetual camera shake.
6. **Render game scene in layers:** structural background, purposeful textures, authored props, actor/contact shadows, light/shadow occlusion, impacts, foreground/UI. Pixel subjects use unsmoothed scaling; volumetric light can be composited at display resolution but must not blur silhouette boundaries.
7. **Test three actual frames** at 390×844 and a small alternative viewport: entry, player action, settled state. Record real interactions, screenshot/video and browser errors. Verify safe areas, legibility, movement, nearest-neighbor, texture budgets and reduced-motion. Do not mark visually reviewed unless images were inspected.
8. **Judge by subtraction.** Remove details, text, controls or effect layers that compete with the next player action. One beautiful focal system beats six incomplete techniques.

## 4. Failure patterns and fixes

- **"AI pixel" with arbitrary fractional pixels:** rebuild on exact integer rows and an indexed palette, remove alpha fringe; never just CSS `image-rendering` a blurred source.
- **Impressive character close-up, unreadable gameplay sprite:** use the exact rendered size and a single-color silhouette test; enlarge the identifying mass, not the outline count.
- **Different apparent scales or light directions between assets:** force one cell-size mapping and directional shadow rule, audit a contact sheet.
- **Beautiful screenshot, dead controls:** complete the main input→effect→objective→end→replay loop before bonus decoration.
- **Over-reliance on implicit generative consistency:** authored source is versioned; build is deterministic; actual render is reviewed after changes.
- **Using visual-kit because it's available:** prefer authored sprites for illustrated protagonists; use real 3D visual-kit only when volume is central.
- **Forge output missing at runtime:** explicit loading state + tested fallback authored from the same source, never an unrelated emoji/procedural placeholder.

## 5. Applied pilot: ПЕПЕЛЬНЫЙ ДОЗОР

An authored 32×32 sprite family + palette-limited undead; independent static masonry pattern; large high-resolution radial flame lighting and occlusion; one-gesture aiming and timed bell pulse; the player can always see cause, exposure, damage and consequence. The authored pixel JSON is the editable source; generated spritesheet PNG is a build artifact. SVG is reserved for engraved logo and controls. Keep all game mechanics runnable when the production asset has not yet been exported by rebuilding exact palette rows once at load; report build status honestly. Do **not** mix low-poly 3D just to tick an adapter checkbox.

## Verification limit

At publication, this is a researched production playbook, **not proof** that any specific app passed video review. An agent must inspect rendered frames, verify Forge availability and link tested revisions independently before asserting full acceptance.
