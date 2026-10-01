# Skill: Visual Direction and Anti-Slop

Use this before implementing or substantially redesigning any visible Pocket Works surface.

## 1. Start with a visual thesis

Before writing UI or renderer code, write a short internal visual thesis containing:

- product fantasy or emotional tone;
- primary user task;
- dominant composition;
- material/texture language;
- typography character;
- geometry language;
- palette logic;
- motion character;
- one signature visual behavior;
- explicit anti-references.

A thesis is concrete. "Clean, modern, premium" is not a thesis. "Dense naval chart with inked coastlines, brass instrument ticks, restrained slate/cream palette, sharp typographic hierarchy, and map labels that drift subtly with zoom" is.

## 2. Use references as evidence, not as skins

When a reference is available, extract properties instead of copying a screenshot:

- color relationships, not exact branding;
- spacing rhythm and density;
- alignment and composition;
- typography personality and hierarchy;
- edge treatment, radius, borders, texture, shadows;
- motion timing and physicality;
- information hierarchy;
- what the reference deliberately omits.

Combine multiple references by role: one may guide typography, another spatial layout, another motion. Never clone proprietary artwork or a branded interface.

## 3. Define design tokens before multiplying screens

For non-trivial UI, decide a compact token set before building the full flow:

- 1 background family;
- 1–2 surface families;
- primary/secondary text;
- 1 functional accent plus status colors;
- spacing scale;
- radius/edge language;
- border/shadow language;
- type scale;
- motion durations/easing presets.

Do not use a huge token catalog to avoid making choices.

## 4. Prefer hierarchy over decoration

At every screen/state, identify:

1. what the user must notice first;
2. what action is primary;
3. what information is secondary;
4. what can wait behind progressive disclosure.

Use contrast, position, scale, whitespace and motion in that order. Decoration must reinforce this hierarchy rather than compete with it.

## 5. Avoid common AI visual defaults

Reject by default:

- centered title + subtitle + grid of same-size rounded cards;
- dark navy/purple gradient + cyan/magenta glow;
- frosted glass panels without a material reason;
- uniform 16–24 px radius on everything;
- all content boxed when grouping can be achieved through spacing;
- identical button/component treatment across unrelated products;
- arbitrary gradients, glows, charts, counters or badges;
- giant hero typography inside a utility/game screen;
- excessive one-line helper copy explaining obvious controls;
- placeholder iconography or emoji in place of a coherent icon system.

If one of these is genuinely right, justify it through the product metaphor.

## 6. Make the first frame authored

The initial frame should not look like a scaffolding state.

It must contain:
- a clear focal point;
- a meaningful immediate action or readable scene;
- finished typography;
- resolved background/surface treatment;
- no empty visual dead zones unless intentionally composed;
- no placeholder blocks.

## 7. Use asymmetry and repetition deliberately

Perfect symmetry is calm but quickly becomes generic. Introduce asymmetry when it supports focus or movement. Repetition should create rhythm, not clone the same card indefinitely.

For information-dense products, vary hierarchy within a consistent grid. For games, preserve the playfield and let UI cluster around actual verbs and state.

## 8. Typography is structural

Choose typography for function and mood, not novelty.

- Keep body text highly readable.
- Use display faces sparingly.
- Tune line-height, measure, weight, letter spacing and optical size where supported.
- Do not solve hierarchy with font size alone.
- Avoid default system/Inter-like sameness unless the product specifically benefits from neutrality.
- Never rasterize essential UI text into Canvas when DOM text would be clearer and more accessible.

## 9. Color is relational

Do not pick isolated hex values. Define:
- background/surface contrast;
- text contrast;
- accent-to-background ratio;
- state colors;
- saturation budget.

Reserve the strongest chroma for meaning or focus. A screen where everything glows has no focal point.

## 10. Complexity must match the concept

Minimalist direction requires precision: spacing, typography, proportions and interaction states must be unusually disciplined.

Maximalist direction requires structure: repeated motifs, controlled palette, clear depth ordering and intentional density. Maximalism is not "add more effects."

## Done condition

The visual direction is ready when another agent could reproduce the same product character from the thesis and tokens without seeing the current implementation.
