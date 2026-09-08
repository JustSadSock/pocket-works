# BELLFORGE // THE LAST CHIME

A compact story-driven Pocket Works 3D game built around Blender-first authored content rather than runtime primitive assembly.

## Premise

Bellforge is a terraced city hanging inside a copper canyon around an ancient resonant machine. At dusk the city clock stops. The player, a junior bellwright named Mara, has one night to cross the Market Ward, restart the Foundry pressure circuit, restore the city resonators and discover why the Warden deliberately silenced the city.

The visual language is painterly industrial fantasy: oxidized teal copper, warm terracotta plaster, blue-black slate, saffron cloth, glowing ceramic resonators and carved dark wood. Important silhouettes, architecture, mechanisms, props and characters are authored in Blender and exported as GLB through Pocket Works Asset Forge.

## Core loop

- Explore a dense connected city from first person.
- Speak to animated NPCs and watch short staged scenes.
- Solve two audible resonance-ring puzzles and restart the Foundry pressure route.
- Evade a patrol automaton during a short chase through service alleys and rooftops.
- Ride the counterweight lift and ascend into the Great Bell chamber.
- Make the final mechanical choice at the Great Bell and reach one of two complete endings.

## Blender pipeline

`asset-forge/manifest.json` generates separate environment, machinery, citizen and Warden GLBs. Scripts author hand-painted PBR materials, collision proxies, armatures and named animation actions, then Asset Forge validates the GLB round trip before Babylon consumes them.

Runtime primitives are limited to invisible collision helpers, particles and resilient fallback geometry. The primary world, mechanisms and characters remain Blender-authored content.

## Mobile rendering

The environment is authored as hundreds of convenient Blender objects, then the forge batches static decoration by material and street zone before export. Collision proxies, animated flags, mechanisms and interactable pieces remain independent. This preserves the authored geometry and material variety while reducing the city GLB from 519 meshes to 91 and keeping mobile draw-call cost predictable. Phone-sized viewports also use the conservative shadow/particle tier regardless of reported logical CPU core count.

Rigid machinery is assembled the same way: gear teeth, valve spokes, fan blades, Great Bell bands and the pendulum weight are joined to their actual moving transform before export, while non-interactive machinery is batched by material. The validated machinery GLB is therefore 23 meshes at the same 28,907 authored vertices, reducing runtime transforms/draw calls while also making each moving mechanism rotate or swing as one physical object.

## 1.1 landscape controls and character pass

Bellforge 1.1 treats a landscape iPhone as the primary controller rather than a desktop viewport shrunk onto a phone. The left thumb gets a floating analog stick with deadzone shaping and sprint hysteresis; the right side is a dedicated look surface whose drag direction follows the finger naturally. Raw pointer movement only updates gameplay state, while cosmetic joystick DOM movement is coalesced to the visual frame so touch input stays responsive under a busy WebGL scene. The HUD, subtitles, interaction button and puzzle panels respect notch/home-indicator safe areas and collapse vertically on short landscape viewports. Portrait launches show an explicit rotate-device gate instead of a cramped playfield.

The Bellwright and Warden are regenerated through Asset Forge with expanded spine/chest/neck, hand and foot bones, stronger silhouettes, extra props and facial/mechanical detail. Each model carries six authored actions — Idle, Walk, Run, Talk/Point, Gesture and Alert — with pelvis motion, torso counter-rotation, head stabilization and articulated hands/feet for less mannequin-like movement while keeping the mobile runtime lightweight.
