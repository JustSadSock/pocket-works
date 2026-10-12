# ПЕПЕЛЬНЫЙ ДОЗОР / Ashward Watch

A complete, solo, portrait-first five-wave survival arcade inside Pocket Works.

## Play
- Drag in the stage to rotate the oil lamp: all enemies standing inside the warm cone take damage continuously.
- Press the bronze **КОЛОКОЛ** to inflict pulse damage and knock nearby enemies away. Cooldown is real.
- Survive five waves, including a final abbot boss; choose one of three non-fake upgrades between waves.
- The lamp has 100 integrity; enemies that reach it damage the reliquary. Every upgrade phase restores eight integrity.
- Keyboard: left/right or A/D rotates, Space rings, P/Escape pauses.
- Refresh can resume the current wave, retaining buffs, integrity, kill count and stage. Loss and win unlock a genuine restart. Best wave, completed runs and mute choice persist locally. Sound uses native WebAudio only after interaction.

## Graphics pipeline
- \`asset-forge/sprites.json\`: authentic 32×32 palette-locked indexed pixel frames with named tags, pivots and durations (editable source).
- \`assets/creatures.png\` and \`assets/creatures.json\`: Universal Art Forge v2-generated texture atlas + animation record. Runtime loads the atlas; when unavailable it renders the SAME palette-indexed editable source once into an offscreen bitmap, never arbitrary substitute art.
- \`asset-forge/emblem.svg\`: original geometric sigil, with \`assets/abbey-emblem.png\` and \`assets/abbey-emblem.svg\` exported through the vector adapter. \`icons/icon.svg\`: app-specific PWA icon.
- \`assets/forge-index.json\`: provenance + verified hashes; output/source freshness checked by \`python3 tools/art-forge/forge.py check --app pepelny-dozor\`.
- The 2D Canvas renderer makes contact shadows, stone floor, gothic arches, material details, flame penumbra and pulses. This is deliberate hybrid rendering, not blurred pixel-art pretending to be high resolution.

To rebuild exports on a machine with Pillow/Inkscape: \`python3 tools/art-forge/forge.py build --app pepelny-dozor\`. Forge jobs are app-scoped and deterministic at pinned editor versions.

## Visual research
The game follows \`docs/agent-skills/AI-VISUAL-PRODUCTION.md\`, based on Aseprite docs, practitioners' solo pixel animation tradeoffs and constrained palette workflows. The Art Bible compares three materially different media and records why the pixel/light hybrid was selected.

## QA
- Load \`/apps/pepelny-dozor/\`, start and sweep the beam; hit Space or tap the bell; survive wave I and select an upgrade; continue through wave V and replay.
- Check iPhone 390×844, small phone ~320×620, and desktop narrow/large; portrait safe areas and bottom physical button.
- Check refresh/restart, browser Back/exit link, mute, pause, game end and offline SW reload.
- \`window.__DOZOR_QA__\` exposes state plus \`aim(angle)\`, \`ring()\`, and \`advance(ms)\` for deterministic browser QA; verify real captured frames before claiming full visual sign-off.

No external API, license-dependent graphics, app shell modification, PocketLAN or PocketNet dependency. The game is intentionally single player.
