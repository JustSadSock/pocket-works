# Pocket Works Audio Asset Forge

Audio Asset Forge is the zero-subscription CPU audio production path for Pocket Works. Repository agents author deterministic app-local audio manifests; GitHub Actions runs the synthesizers on a hosted Linux runner and commits finished audio assets back to the same non-main feature branch.

No local PC, GPU, neural model or paid API is required.

## Toolchain

Audio Forge combines three deliberately different tools:

- **Jfxr/sfxr-family synthesis (`jsfxr`)** for short game SFX such as UI feedback, impacts, pickups, shots and synthetic mechanical transients;
- **SoX** for noise beds, simple procedural ambience, filtering, normalization, resampling, stereo conversion, reverb and final `.wav` / `.ogg` encoding;
- **FluidSynth** for deterministic MIDI-to-audio rendering through a General MIDI SoundFont.

The CI workflow installs these tools only on the GitHub-hosted runner. They are not runtime dependencies of Pocket Works applications.

## App-local contract

An application owns both its generation source and outputs:

```text
apps/<slug>/
├── audio-forge/
│   └── manifest.json
└── assets/
    └── audio/
        └── generated/
            ├── ui-confirm.ogg
            ├── wind.ogg
            └── theme.ogg
```

Keeping all files under `apps/<slug>/**` preserves Pocket Works application-branch isolation.

### Manifest v1

```json
{
  "version": 1,
  "jobs": [
    {
      "name": "ui-confirm",
      "type": "sfx",
      "preset": "blipSelect",
      "seed": 42,
      "output": "assets/audio/generated/ui-confirm.ogg",
      "post": {
        "normalizeDb": -4,
        "highpass": 90,
        "lowpass": 12000
      }
    },
    {
      "name": "wind",
      "type": "ambient",
      "generator": "brownnoise",
      "duration": 8,
      "channels": 2,
      "output": "assets/audio/generated/wind.ogg",
      "post": {
        "normalizeDb": -12,
        "highpass": 35,
        "lowpass": 1800
      }
    },
    {
      "name": "theme",
      "type": "music",
      "tempo": 96,
      "program": 48,
      "output": "assets/audio/generated/theme.ogg",
      "notes": [
        { "note": "C3", "beat": 0, "duration": 2, "velocity": 72 },
        { "note": "G3", "beat": 0, "duration": 2, "velocity": 62 },
        { "note": "Eb4", "beat": 2, "duration": 2, "velocity": 68 }
      ],
      "post": {
        "normalizeDb": -5,
        "reverb": 18
      }
    }
  ]
}
```

## Job types

### `sfx`

Uses `jsfxr` with a deterministic random seed. `preset` may use the supported sfxr presets such as `pickupCoin`, `laserShoot`, `explosion`, `powerUp`, `hitHurt`, `jump`, `blipSelect`, `synth`, `tone`, `click` or `random`.

For authored parameter sets, provide a `params` object instead of `preset`; it is passed directly to the sfxr renderer. Generated samples are written as PCM and then passed through SoX for final processing and encoding.

### `ambient`

Uses SoX synthesis. Supported generators are:

- `whitenoise`
- `pinknoise`
- `brownnoise`
- `sine`
- `square`
- `triangle`
- `sawtooth`
- `pluck`

Noise is useful for wind, machinery beds, distant surf-like layers and other continuous textures. Tonal generators may specify `frequency`.

### `music`

Audio Forge writes a standard MIDI file internally and renders it with FluidSynth plus the CI-installed General MIDI SoundFont.

Important fields:

- `tempo`: BPM;
- `program`: General MIDI program number, `0..127`;
- `channel`: optional MIDI channel, `0..15`;
- `synthGain`: FluidSynth master gain;
- `notes`: note events with `note`, `beat`, `duration`, optional `velocity` and optional `channel`.

Notes accept either MIDI numbers or names such as `C3`, `F#4`, `Bb2`.

## Common post-processing

Every job may contain `post`:

```json
{
  "sampleRate": 48000,
  "channels": 2,
  "highpass": 40,
  "lowpass": 14000,
  "reverb": 12,
  "fadeIn": 0.01,
  "fadeOut": 0.08,
  "normalizeDb": -4
}
```

The fields are optional. Final output must currently be `.wav` or `.ogg`.

## Automatic branch flow

After the platform workflow exists on `main`:

1. An agent creates or edits `apps/<slug>/audio-forge/manifest.json` on a non-main app branch.
2. Pushing `apps/<slug>/audio-forge/**` starts **Audio Asset Forge**.
3. GitHub installs SoX, FluidSynth, a General MIDI SoundFont and isolated `jsfxr`.
4. Only affected app manifests are rendered.
5. The workflow records generated paths in `.audio-forge-generated.txt`.
6. Changed audio outputs are committed back to the same feature branch as `Generate audio assets`.
7. Generated-output commits do not touch `audio-forge/**`, so they do not retrigger generation indefinitely.

This mirrors Blender Asset Forge: the agent authors production instructions; GitHub supplies the heavier execution environment.

## Manual use

From GitHub:

1. Open **Actions** → **Audio Asset Forge**.
2. Choose **Run workflow**.
3. Leave `app` empty on `main` to run the platform smoke test.
4. To rebuild an application, choose its non-main branch and enter the app slug.

The platform smoke test produces three short artifacts: one sfxr SFX, one SoX ambience file and one FluidSynth music file. It also validates them with `soxi` and uploads them as a short-lived Actions artifact.

## Runtime guidance

Generated samples should not replace runtime variation. Frequent events such as footsteps, sword impacts, debris hits and UI taps should still randomize pitch, gain, layer choice, timing or filtering where appropriate. Continuous physical sounds may remain procedural Web Audio/Tone layers when that is cheaper and more responsive than a rendered file.

Use Audio Forge when an actual asset is useful; do not render every possible runtime sound into hundreds of nearly identical samples.

## Security and isolation

- production generation writes only on non-main branches;
- output paths are constrained to the owning app directory;
- Audio Forge does not receive application secrets;
- no paid API keys are used;
- app PRs should change only their own `apps/<slug>/**` files;
- changes to the shared Audio Forge workflow/tools are platform work.
