# Skill: Game UI and Product Interface

Use for HUDs, menus, dialogue, inventories, settings, overlays, controls, onboarding and utility surfaces inside games/apps.

## 1. Design around verbs, not generic components

Start from what the user does:
- move;
- aim;
- select;
- compare;
- build;
- attack;
- inspect;
- talk;
- confirm;
- undo;
- navigate.

The interface hierarchy should mirror these verbs. Do not begin with a dashboard template and try to pour game mechanics into it.

## 2. Protect the playfield

For live gameplay, persistent UI must earn its screen space.

Prefer:
- edge anchoring;
- compact contextual controls;
- progressive disclosure;
- auto-hiding secondary information;
- modal states that pause/disable world input correctly.

Avoid full-width top + bottom chrome plus central cards over a live scene.

## 3. DOM for text-heavy UI

Default to DOM/CSS for menus, dialogue, settings, long text and complex layout even when the world is Canvas/WebGL.

Benefits:
- sharper text;
- accessibility;
- responsive layout;
- input/focus semantics;
- easier localization;
- easier QA.

Use Canvas/WebGL UI only when spatial integration or visual effects genuinely require it.

## 4. Mobile touch targets and reach

- Aim for roughly 44×44 CSS px or larger for critical targets.
- Separate destructive/irreversible actions spatially.
- Respect safe-area insets.
- Do not place frequently used controls under browser/home-indicator danger zones.
- Avoid requiring precise tapping during motion.
- For virtual sticks, allow an appropriately sized activation region and clear recentering behavior.

## 5. Information hierarchy

Persistent HUD should answer only high-frequency questions.

Typical priority:
1. immediate survival/action state;
2. current objective or contextual action;
3. scarce resources;
4. temporary status;
5. everything else behind a secondary surface.

Do not show lore, controls, objectives, resources, logs and settings simultaneously just because there is room in the component tree.

## 6. Controls must have state

Every control must communicate:
- available;
- pressed/dragged;
- disabled;
- cooldown/loading;
- invalid;
- success/confirmation when relevant.

Disabled state must explain itself when ambiguity would frustrate the user.

## 7. Typography and iconography

Use short labels where icons are ambiguous. Do not invent mystery glyphs for core actions.

For games, UI typography can inherit the world, but functional labels remain readable. Separate display typography from dense text.

Keep icon stroke/fill language consistent. Avoid mixing emojis, outline icons, hand-drawn symbols and Unicode characters without a deliberate system.

## 8. Menus should feel like the same product

A beautiful game with default SaaS settings panels still feels unfinished.

Carry into menus:
- material language;
- typography;
- edge/radius logic;
- color roles;
- motion;
- audio feedback.

Do not sacrifice standard affordances to stay "in-world." Familiarity is useful when the user is performing a task.

## 9. Dialogue and narrative UI

- Keep line length readable.
- Make speaker identity clear without giant nameplates.
- Choice buttons need distinct hit areas and a clear selected/pressed state.
- Avoid verbose AI-like helper prose.
- Keep the scene visible when the fiction benefits from it.
- Transition choice consequences visibly; do not hard-cut every state unless stylistically intended.

## 10. Responsive strategy

Do not simply scale a desktop UI down.

Define:
- what remains persistent;
- what collapses;
- what becomes modal;
- what moves closer to thumbs;
- what text shortens;
- what scene area must remain visible.

Test narrow portrait first for portrait-first apps.

## 11. Accessibility and comfort

- maintain readable contrast;
- support reduced motion;
- do not encode critical meaning with color alone;
- ensure focus behavior where keyboard/assistive navigation is relevant;
- add labels/semantics to DOM controls;
- avoid flashing/strobing effects.

## Done condition

The interface is successful when a first-time user can discover the primary loop without an external explanation and the screenshot still reads as the game/app itself rather than as a generic component demo.
