# Attribution

## Sandspiel

- Project: `MaxBittker/sandspiel`
- Author: Max Bittker
- License: MIT
- Copyright: © 2018 Max Bittker

Sandspiel was used as an architectural and product reference for cellular falling-sand simulations. No source file or asset from Sandspiel is copied into this release. The implementation, material model, UI, interaction design, scenarios, tasks, visual synthesis editor and persistence format were written specifically for Pocket Works.

## Adapted concepts

- double-buffered thinking for per-cell updates;
- randomized scan direction to reduce directional artifacts;
- local-neighborhood reactions;
- palette-based material rendering.

## Material changes

The application adds a separate simulation model for temperature diffusion, pressure, electrical charge, brittle destruction, devices, biological growth, custom reaction rules, visual material synthesis, analytical overlays, sensors, rewind history, task predicates and offline storage.
