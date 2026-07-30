# FORMA 1.1: Blueprint migration

FORMA no longer asks an AI model to design functional mechanisms directly as low-level CSG. The primary import contract is now `forma-blueprint-1`: semantic parts plus engineering constraints. The deterministic compiler generates teeth, gear spacing, axle posts, enclosure cavities and a removable cover.

Low-level `formacode-1` remains supported as an advanced and backward-compatible format.

The reference Gearfly Blueprint compiles into four printable parts and a 2.8:1 gear pair. Invalid modules or references stop compilation and produce a repair packet for the AI.
