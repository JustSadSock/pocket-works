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
