# Skill: Unslop — product-specific interface refinement

Load for every new or materially redesigned Pocket Works app interface, and whenever a screen feels generic, overdecorated, inconsistent, or AI-generated. Use alongside `VISUAL-DIRECTION.md`, relevant UI/interaction skills, and `VISUAL-QA.md`. This is an independently adapted Pocket Works implementation of Damir Sokolovsky's **Unslop** (CC BY 4.0): https://github.com/heydamir/unslop/blob/main/skills/unslop/SKILL.md . Credit: Damir Sokolovsky (https://heydamir.design/unslop). The original license applies to copied material; this document paraphrases the approach for Pocket Works.

## Principle

Remove generic decoration without removing the product's personality. Quiet navigation and controls should support one or two distinctive, meaningful visual moments. A finished screen must belong unmistakably to its particular game or utility. Do not force minimalism on illustrated, playful, medieval, or deliberately maximalist experiences.

## When and how to run

1. Inspect the actual rendered interface at mobile portrait and desktop widths, not CSS alone. Identify real workflow, existing brand, primary action, and defects.
2. Audit for gratuitous gradients/glows, interchangeable rounded cards, emoji labels, excessive badges, fake statistics, inflated headings, inconsistent spacing, redundant copy, decorative icons, motion without purpose, and clipped or hidden controls.
3. Choose scope: **no issue** = preserve the design; **light issue** = targeted polish preserving palette and structure; **heavy issue** = full refinement. Never redesign a good screen merely to satisfy a checklist.
4. Before editing, record five short decisions: **product** (user and job), **character** (specific adjectives), **world** (material or setting), **moments** (one or two content-rich focal points), **signature** (one repeatable product-specific detail). Preserve deliberate established brand and explicit user choices.
5. Execute passes in order: **spacing → color → icons → copy → typography → layout → components/details → visuals → motion**. Keep the product's working features, content, navigation, and interaction semantics.
6. Render again, compare against the audit, fix remaining issues, and validate all interactive states and breakpoints. Never replace functional content with a static mockup.

## Pocket Works rules

### Spacing
Use a coherent 4px-based rhythm where practical, consistent rows and alignment, grouped gaps, adequate phone safe areas, and ≥44px touch targets. Prefer consistent components over arbitrary one-off offsets.

### Color
Start with a restrained, coherent neutral/surface hierarchy, then assign accent color to meaning, selection and the primary action. Keep rich color in game art, meaningful charts and signature moments. Avoid rainbow chrome, generic purple-blue gradients, gratuitous glows and neon outlines. Maintain accessible contrast.

### Icons
Prefer a consistent icon family or original illustrated assets. Do not use arbitrary emoji as UI chrome. In games, thematic iconography is welcome when it conveys a clear action or state.

### Copy
Use short, precise, product-specific labels; eliminate hype, repeated instructions, fake claims, meaningless badges and placeholder metrics. Explain errors and irreversible actions. Preserve helpful onboarding and genuine game lore when appropriate.

### Typography
Use a deliberate type scale and restrained weights. Avoid universal extra-bold display headings, all-caps tracked micro-labels, and tiny low-contrast captions. Align numbers and keep labels readable on mobile.

### Layout
Respect the Pocket Works launcher and app viewport. Do not reduce desktop tools to a narrow marketing column. Do not bury primary actions in card stacks, over-scroll single-purpose phone screens, or sacrifice functional density. Keep navigation predictable.

### Components and details
Buttons, inputs, menus and dialogs must share geometry and state language. Every control must have a real outcome; include pressed, loading, empty, success and error states. Avoid decorative UI that looks clickable but is not.

### Visuals
Use one or two distinctive, product-grounded focal moments: game board, physical object, illustrated scene, real preview, or useful data visualization. Do not add hero art merely to occupy space. Original visuals may be authored with appropriate tools, with source and provenance requirements from `AI-VISUAL-PRODUCTION.md`.

### Motion
Animate state changes and physical interactions, not ambient chrome. Respect reduced-motion settings, preserve touch responsiveness, and avoid distracting looping effects. Load `GESTURES.md` for drag/swipe interactions.

## Acceptance checklist

- Can a first-time user identify the next action in five seconds?
- Does the interface have a recognizable identity rather than a reusable AI template?
- Are spacing, type, iconography and color consistent?
- Is every visual effect justified by product content or interaction?
- Are all controls functional and states understandable?
- Is the rendered result usable in portrait phone and desktop layouts?
- Are accessibility, safe areas, performance and reduced motion respected?
- Did the refinement preserve existing product behavior?

Report only concrete changes and unresolved issues. This skill is design guidance, not a runtime dependency.
