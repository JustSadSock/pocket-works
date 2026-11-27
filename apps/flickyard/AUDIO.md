# FLICKYARD — sound palette

## Materials

The range combines enamel-coated target plates, thin steel rails, brass adjustment screws and a felt-lined mechanical housing. There are no weapon samples or stock firearm sounds.

## Event families

- **Hit:** a sharp ceramic/steel contact, a short low plate resonance and a restrained high enamel tick.
- **Miss:** a dull felt-backed knock with a brief low-frequency body; it should be clearly different from a hit without sounding punitive.
- **Mode selection:** a dry brass latch and a small spring return.
- **Session finish:** one heavier plate resonance followed by a short two-note mechanical settle.

## Character and anti-references

Dry, tactile, compact, metallic and slightly warm. Avoid generic digital beeps, repeated stock mouse clicks, exaggerated arcade lasers and loud gunshot samples.

## Implementation

sound.mjs synthesizes filtered noise and short independent tonal layers through Web Audio after a user gesture. It limits overlapping voices, uses small controlled pitch/duration variation, exposes a mute control and makes no external audio requests. Sound is supplemental; every event also has immediate visual feedback.
