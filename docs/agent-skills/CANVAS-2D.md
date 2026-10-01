# Skill: Canvas 2D and Procedural Illustration

Use for Canvas-rendered scenes, top-down games, procedural art, sprite systems, custom diagrams, and illustrated transitions.

## 1. Separate simulation, scene data and rendering

Do not bury the world inside imperative draw calls.

Prefer:
- stable scene/state data;
- a deterministic renderer that consumes state;
- separate input/simulation update;
- reusable drawing primitives or sprite definitions;
- a clear layer stack.

A useful pattern is `update(dt)` + `render(state, t)`, with render free of gameplay side effects.

## 2. Render in semantic layers

Build the frame as an ordered stack, for example:

1. background field / sky / ground;
2. large environmental masses;
3. texture and material variation;
4. props and characters;
5. contact shadows / decals;
6. VFX;
7. foreground occlusion;
8. debug-only overlays;
9. DOM UI above Canvas when text-heavy.

Layering is the main source of depth in 2D. Do not try to get richness from hundreds of unrelated shapes.

## 3. Commit to a shape language

For each asset family define:
- silhouette rules;
- edge softness;
- internal detail scale;
- line/outline policy;
- palette range;
- light direction;
- texture frequency.

Do not let every object use a different rendering trick.

For top-down characters, silhouette and facing readability matter more than tiny detail.

## 4. Use constrained palettes

Programmatic art improves when color choices are bounded.

Define:
- named palette roles;
- a small material palette per environment;
- controlled value ranges;
- accent colors used sparingly.

For pixel art, use exact integer dimensions, a deliberately limited palette, nearest-neighbor scaling, and consistent pixel density. Avoid mixing sub-pixel antialiasing with intentionally hard pixel art.

## 5. High-DPI correctness

For non-pixel Canvas:
- size the backing buffer using device pixel ratio;
- keep CSS size separate from backing resolution;
- scale the context once;
- test on high-DPI mobile screens.

For pixel art:
- keep a logical low-resolution buffer;
- scale by integer factors where possible;
- disable image smoothing.

## 6. Deterministic procedural detail

Randomness should usually be seeded per object, tile, chunk or scene.

Use deterministic noise for:
- paper/ground grain;
- foliage variation;
- stone cracks;
- debris;
- star fields;
- ink/print imperfections;
- shape jitter.

Unseeded random calls inside every frame cause flicker and make screenshot QA impossible.

## 7. Texture should follow material

Do not spray noise over the whole screen.

Examples:
- stone: broad value breakup + sparse cracks + edge wear;
- wood: directional grain + joint variation;
- dirt: clustered pebbles + hue/value drift;
- paper/ink: fiber grain + ink density variation + slight registration error;
- water: directional bands/highlights tied to flow/wind.

Texture frequency must be lower than the frequency of gameplay information.

## 8. Reuse authored assets where procedural drawing stops paying off

Canvas is excellent for:
- stylized geometry;
- maps;
- abstract effects;
- particles;
- decals;
- simple terrain;
- pixel art;
- procedural ornament.

It is a poor excuse for drawing a complex hero character badly. If a key object benefits from authored art, use app-local images/sprites or another asset pipeline.

Keep asset generation separate from gameplay logic.

## 9. Animation principles

Use:
- pose interpolation;
- squash/stretch;
- secondary motion;
- short anticipation;
- follow-through;
- eased transitions;
- per-part phase offsets.

Avoid:
- linear movement for expressive objects;
- independent sine-wave motion on every element;
- random jitter masquerading as life;
- frame-rate-dependent animation.

Use `dt` or time-based sampling. For procedural animation that must be seekable/reproducible, prefer pure functions of time plus seeded parameters.

## 10. Camera and composition

A 2D scene still needs cinematography.

Control:
- framing and safe zones;
- visual anchors;
- foreground/background separation;
- camera dead zones;
- look-ahead;
- zoom cadence;
- parallax;
- occlusion.

Do not center the player mechanically if the gameplay benefits from looking ahead.

## 11. Performance

Use offscreen/pre-rendered layers for expensive static content. Cache paths/sprites when practical. Avoid allocating large arrays/objects every frame. Cull offscreen objects. Pause the loop when hidden. Avoid full-canvas filters on mobile unless measured.

Performance changes must preserve visual identity; do not "optimize" by deleting the authored look without profiling.

## 12. Canvas vs DOM

Use Canvas for the world and high-frequency custom rendering.

Use DOM/CSS for:
- dialogue text;
- settings;
- forms;
- menus;
- long labels;
- accessibility-critical controls;
- complex responsive layout.

Hybrid rendering is usually better than forcing the entire product into Canvas.

## Visual checklist

Before sign-off:
- no flicker from random rendering;
- no blurry high-DPI output;
- no unintended smoothing in pixel art;
- clear silhouettes at target phone size;
- depth reads without UI;
- palette stays coherent in motion;
- decorative detail never hides interaction targets;
- screenshot comparison covers idle + active/action state.
