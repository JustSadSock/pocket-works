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

## Universal Sound Forge 0.1 — Foundation & Expressivity

Manifest v1 remains supported. Manifest v2 adds original procedural sound families and optional multi-instrument music tracks; it uses the same runner and output ledger. No external recordings, neural models or paid services are required. This is an incremental platform foundation, not a completed universal runtime.

```json
{
  "version": 2,
  "jobs": [],
  "families": [
    {
      "id": "blade-impact",
      "model": "sword",
      "seed": 42,
      "variants": 12,
      "strength": 0.7,
      "spread": 0.18,
      "source": "original",
      "format": "ogg",
      "outputDir": "assets/audio/generated"
    }
  ]
}
```

Supported models: sword, shield, glass, explosion, rain. Families produce 2–32 numbered stereo 48 kHz variants. The seed controls each variant's independent synthesis; strength changes peak level and metal resonance, spread changes strength between variants. Avoid per-variant peak normalization if preserving relative dynamics is important. Rain is a finite ambience clip, not yet a seamless loop. The explosion is rendered dry; use explicit post reverb or future runtime acoustics. All foundation models are authored synthesis, not verified recordings. External sample references are intentionally unsupported. Existing SoundFont rendering remains subject to its own instrument license.

Music jobs may specify tracks instead of flat notes. Each melodic track has its own channel (automatically assigned unless explicit), program, notes, volume, pan, expression, modulation, humanizeBeats, humanizeVelocity and legato. Legato is a bounded overlap between adjacent different pitches in a monophonic track; repeated pitches do not overlap. It is not a true continuous pitch transition or a guarantee that every SoundFont implements legato naturally. Modulation is a static MIDI controller setting. The renderer does not yet implement dynamic expression curves, portamento, breath modelling or stems. The existing flat score format is unchanged.

Run the foundation gate:
```sh
node --test tools/audio-forge/foundation.test.mjs
node tools/audio-forge/run_manifest.mjs --manifest tools/audio-forge/foundation-smoke.json --base .audio-forge-foundation
```

CI keeps the original three-asset smoke test and additionally generates fifteen foundation audition WAVs in an Actions artifact (including four paired performance comparisons). Unit tests check deterministic expansion and PCM, distinct variants, finite levels, manifest rejection, and expressive MIDI arrangement. Audition quality is a separate human gate. Do not deploy these smoke files as application assets.

Next steps: shuffle-bag selection in shared runtime, verified sample provenance and hybrid layer support, additional crowd/mechanism models, instrument-specific articulation and parameterized adaptive stems. Existing games remain unchanged until audition and integration gates pass.

### Sound family playback (opt-in)

```js
import { createSoundFamilyPlayer } from './shared/capabilities/sound-family.js';
// Use the application's existing AudioContext and mixer destination.
const player = createSoundFamilyPlayer({
  context,
  destination: masterGain,
  maxVoices: 16,
  maxBuffers: 32,
  families: {
    blade: {
      variants: ['assets/audio/generated/blade-impact-01.ogg',
                 'assets/audio/generated/blade-impact-02.ogg'],
      gain: 0.7,
      pitchCents: 35,
      gainSpread: 0.1
    }
  }
});
await player.preload('blade'); // optional; a user gesture is still needed for playback
await player.play('blade', { gain: 0.8, pan: -0.3, priority: 1 });
// on app teardown: player.destroy();
```

Selection uses a shuffle bag: each variant is selected once per cycle and adjacent selections differ across cycle boundaries (except singleton families). Concurrent fetch completion can reorder audible playback. Playback-rate and gain jitter are bounded; decoded buffers use a count-bounded LRU cache, concurrent downloads are deduplicated, and voice stealing favors higher priority. The player does not own the context or master mixer. Disable/stop invalidates pending play calls; destroy also aborts pending downloads. Preload may evict earlier entries if the configured cache is smaller than the family. A false result indicates an unavailable, cancelled, or rejected voice. Existing tone feedback is not changed. No distance simulation, loop crossfade, voice virtualization or browser-device validation yet.

Node tests use a mocked Web Audio context; real Chromium/WebKit interaction is a separate gate.

### Expressive performance automation

Music tracks can opt into a `performance` object. Existing scores do not change.

```json
{
  "program": 42,
  "humanizeBeats": 0,
  "notes": [
    {"note":"D4","beat":0,"duration":2,"velocity":78},
    {"note":"F4","beat":2,"duration":2,"velocity":78}
  ],
  "performance": {
    "curves": {
      "expression": [{"beat":0,"value":65},{"beat":2,"value":110},{"beat":4,"value":55}],
      "breath": [{"beat":0,"value":45},{"beat":2,"value":95},{"beat":4,"value":40}]
    },
    "vibrato": {"depthCents":22,"rateHz":5,"delayBeats":0.24},
    "attackBend": {"cents":-28,"durationBeats":0.12}
  }
}
```

Curve points use increasing beats and values 0–127; supported controllers are expression (CC11), breath (CC2), and modulation (CC1). Linear interpolation emits up to 32 subdivisions per beat. Pitch gestures use a fixed two-semitone MIDI bend range, bounded vibrato (0–80 cents) and attack bend (-100 to +100 cents); the bend resets after the note. Pitch gestures require non-overlapping monophonic notes on an isolated channel. For these tracks use zero timing jitter or author explicit gaps; overlap legato and pitch gestures cannot be combined. Controller automation is channel-wide. Breath response depends on the SoundFont and is not a physical breath simulator. Attack bend is a small expressive scoop, not full note-to-note portamento. Use the four medieval/orchestral control/expressive audition files to judge the actual render; successful MIDI generation alone does not establish musical quality.

### Hybrid Engine and local Pocket Sound Library (initial contract)

A v2 manifest may contain a `samples` catalog, with paths relative to the manifest directory. Hybrid jobs use an original physics model and a catalog sample. The current policy permits only original, CC0-1.0 and public-domain declarations, requires explicit redistribution permission, creator, provenance, tags and SHA-256. External records additionally require a source URL and rights evidence. These are metadata gates, not independent legal verification: an agent must verify the actual source and its license before committing a file. No restricted audio belongs in the public repository.

```json
{
  "version": 2,
  "samples": [
    {
      "id": "impact-source",
      "path": "sources/impact.wav",
      "title": "Original impact",
      "creator": "Pocket Works",
      "license": "original",
      "provenance": "Author-owned recording",
      "redistribution": true,
      "sha256": "REPLACE_WITH_ACTUAL_SHA256",
      "tags": ["impact", "metal"]
    }
  ],
  "jobs": [],
  "families": [
    {
      "id": "blade",
      "model": "sword",
      "sampleId": "impact-source",
      "sampleMix": 0.25,
      "variants": 8,
      "outputDir": "assets/audio/generated"
    }
  ]
}
```

A hybrid job can also be declared directly with type hybrid, model, sampleId and sampleMix. SoX decodes local WAV/OGG/FLAC to stereo 48 kHz float PCM; samples are trimmed or zero-padded to the procedural clip duration. The sample is RMS-matched to the synthesis before mixing (0 = all synthesis, 1 = all sample), with short boundary fades and peak protection. Ratios are coefficients, not perceived loudness percentages. Catalog paths are confined by realpath and sample hashes are checked before rendering. Search supports case-insensitive terms across title, creator, ID and tags. This is an in-memory manifest catalog, not yet a persistent global database, semantic index, or asset vault. All variants of a hybrid family currently reuse the same source sample.

CI generates an original synthetic explosion fixture and renders 0/25/50/75/100% sample ratios; it uploads the source, manifest and resulting WAVs separately from musical probes. This tests the pipeline, not the naturalness of field recordings. No external recording has been acquired or independently cleared yet.
