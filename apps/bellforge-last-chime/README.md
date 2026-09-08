# BELLFORGE // THE LAST CHIME

A compact story-driven Pocket Works 3D game built around Blender-first authored content rather than runtime primitive assembly.

## Premise

Bellforge is a terraced city hanging inside a copper canyon around an ancient resonant machine. At dusk the city clock stops. The player, a junior bellwright named Mara, has one night to cross the Market Ward, the Foundry and the Bell Tower, restore three resonators and discover why the Warden deliberately silenced the city.

The visual language is painterly industrial fantasy: oxidized teal copper, warm terracotta plaster, blue-black slate, saffron cloth, glowing ceramic resonators and carved dark wood. Important silhouettes, architecture, mechanisms, props and characters are authored in Blender and exported as GLB through Pocket Works Asset Forge.

## Core loop

- Explore a dense connected city from first person.
- Speak to animated NPCs and watch short staged scenes.
- Solve three spatial resonance puzzles by aligning mechanical rings and routing power.
- Evade a patrol automaton during a short chase through service alleys and rooftops.
- Ascend the bell tower while the city physically changes around you.
- Make the final mechanical choice at the Great Bell and reach a complete ending.

## Blender pipeline

`asset-forge/manifest.json` generates separate environment, character and prop GLBs. Scripts author materials, collision proxies, armatures and named animation actions, then Asset Forge validates the round trip before Babylon consumes them.

Runtime primitives are limited to invisible collision helpers, particles and fallback/debug geometry.
