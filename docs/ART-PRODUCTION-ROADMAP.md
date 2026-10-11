# Universal art production — implementation sequence

## I. Visual Intelligence

Implemented contract: research, three competing concepts, evidence-backed visual
memory, expanded Art Bible, production budgets and rendered-image diagnostics.
See VISUAL-INTELLIGENCE.md. Keep visual checks active throughout all stages.

## II. Universal Art Forge — implementation and acceptance

Build a versioned asset job protocol: input/source, tool adapter, deterministic
parameters/seed, outputs, provenance, validation, preview and app integration.
Extend Blender Asset Forge; add 2D adapters after verifying the actual installed
Pixelorama/Krita versions and their supported automation. Tool selection follows
the Bible and observed capability, never a fixed style list. Preserve editable
sources and expose unavailable tools/fallbacks explicitly. No arbitrary commands
from untrusted manifests. Jobs stay app-owned; validate containment, dependency
ordering, formats, texture/geometry budgets and runtime loading.

Accept with real pixel/raster, vector, authored GLB and baked 2.5D assets; export,
edit source, regenerate, load offline and visually inspect each in a real scene.
See UNIVERSAL-ART-FORGE.md for the v2 contract and the source-to-scene CI evidence.

## III. Animation & Game Feel Studio

Define a shared clip/event timeline with named contact, release, impact and audio
events; cancellation, blending, pause/resume, playback speed and reduced motion.
Adapters support frame sequences, armatures, procedural motion and sprite baking.
Connect Audio Forge through event timing. Keep gameplay authoritative and avoid
queued feedback when input interrupts a clip. Verify recordings, event ordering,
frame pacing and repeated interaction on phone Chromium/WebKit.

Accept distinct drawn motion, skeletal 3D and contact-driven physical response,
including sounds, interruption and reload of exported clips.
Implementation contract and rendered acceptance evidence: ANIMATION-STUDIO.md.

## IV. Visual Critic & Continuous Improvement

Build an evidence package from real gameplay: comparable before/after states,
video, viewport, tested SHA, console/network errors and scenario outcomes.
Critic findings identify frame/time, observable defect, likely cause, confidence
and proposed fix. Apply bounded revisions and rerun gameplay + visual checks.
No aggregate score may authorize publishing. Unresolved defects remain explicit.

Accept by deliberately introducing a defect, finding it from rendered evidence,
fixing its cause and demonstrating improvement without gameplay regression.

## Six acceptance briefs across the roadmap

1. Top-down pixel soldiers: readable roles, coherent pixel scale, walk/attack/death.
2. Drawn 2D: original silhouettes and changing hand-authored poses.
3. Medieval miniature: historically researched proportions/marks, coherent motion.
4. Comic 3D: authored models, outlines, stylized materials, camera and environment.
5. Miniature diorama: physical volume, composition, materials and depth.
6. More realistic 3D: credible light/material response within measured budgets.

These are capability tests, not reusable skins. Each has an app-local Bible,
source/export contract, complete interaction, browser QA and reviewed recordings.
Platform work and demonstration apps ship in separate PRs. Record actual tool
and quality limitations; do not promise arbitrary complexity or photorealism.
