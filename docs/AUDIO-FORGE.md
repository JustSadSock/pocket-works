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

### Persistent Pocket Sound Library and field recording auditions

Node 22's built-in SQLite/FTS5 provides a local vault with no service or database subscription. Use a directory outside the repository for ordinary production storage.

```sh
node tools/audio-forge/library-cli.mjs /path/to/vault import /path/to/source-manifest.json
node tools/audio-forge/library-cli.mjs /path/to/vault search rain weather
node tools/audio-forge/library-cli.mjs /path/to/vault resolve stockholm-rain
node tools/audio-forge/library-cli.mjs /path/to/vault export /path/to/vault/manifest.json
```

Imports use the rights and SHA-256 checks above, content-addressed objects and an SQLite transaction for the index. Identical file bytes with the same extension share storage; source bytes are verified again on resolution. IDs are immutable. FTS searches token prefixes with AND semantics across title, creator and tags. Export preserves relative object paths and does not overwrite an existing manifest. The vault is not a remote service, and an interrupted import can leave an unindexed object; garbage collection is not yet implemented.

The independent field-recording-audition CI job imports three specifically reviewed public-domain Wikimedia Commons recordings. Source records are pinned to the reviewed revision, exact download URL, byte count and published SHA-1; SHA-256 is computed after retrieval and checked on vault resolution. Sources: Fg2's Nikko festival explosion recordings (revisions 1237586287 and 1151334253) and Caesar's rain/thunder recording (revision 1129569613). The importer fails closed on unavailable or changed bytes. No credentials or external AI. The field recording archive includes originals, catalog, manifest and seven dry/hybrid render WAVs. A successful import does not imply artistic acceptance.

The opt-in `compensateRms: true` field reduces the level dip when mixing independent sources, with a maximum 2x gain and peak ceiling; default mixing remains unchanged. New opt-in physical models `sword-v2`, `glass-v2`, `gear`, `chain` target metallic brightness, brittle fragments and distinct mechanisms. The previous models remain as controls. Foundation CI now renders 23 files. Real recording comparisons and new effects require human listening.

### Spatial audio runtime (opt-in)

`shared/capabilities/spatial-audio.js` exposes `spatialProfile` and `createSpatialMixer`. Use one existing AudioContext and route separate family players to named mixer buses:

```js
const mixer = createSpatialMixer({context, volume: 0.7});
const player = createSoundFamilyPlayer({
  context, destination: mixer.bus('combat'), families
});
await player.play('blade', {
  gain: 0.8, priority: 2,
  spatial: {
    source: {x: 24, y: 15},
    listener: {x: 10, y: 10},
    heading: 0, referenceDistance: 5, maxDistance: 120,
    occlusion: 0.5, zone: 'forest'
  }
});
mixer.setBusVolume('combat', 0.6);
// On teardown: player.destroy(); mixer.destroy();
```

Coordinates use consistent game-world units; heading is radians, zero points along +x and +y is right at that heading. Inverse-square-style attenuation, a soft range cutoff, zone-specific absorption and caller-supplied occlusion (0–1) determine level and lowpass. Zones open/forest/stone/interior specify one short early reflection, not full reverberation or ray tracing. Reflected tails occupy voice budget until cleanup; stopping a player also clears them. The mixer provides up to 16 independently adjustable buses and a compressor when supported, not a guaranteed brickwall limiter. Spatial state is sampled at play time; moving emitters, geometry-derived occlusion, Doppler, continuous loops and browser audio fidelity are future work. Existing non-spatial callers are unchanged. Unit tests mock the audio graph; real browser audio tests remain necessary.

Hybrid jobs and families may specify `sampleStart` in seconds (0–3600) to cue a source without changing the archived original. SoX decodes with input headroom before RMS matching. In the verified Nikko recording, the main impact begins near 0.60 s; the new 0.59 s cue reduces the roughly 0.61 s peak delay to about 0.02 s. The field recording job preserves the seven previous comparisons and adds three aligned variants (25/75/100%); ten generated WAVs in total. Short recordings are zero-padded by the mixer. Do not interpret an original field recording as automatically suitable for an event without checking its timing and content.

### Continuous audio: moving emitters, seamless loops and adaptive stems

`shared/capabilities/continuous-audio.js` provides three opt-in APIs. It uses the application's AudioContext and optional mixer buses; it never closes the context.

```js
const ambience = makeSeamlessLoop(context, decodedRain, {crossfadeSeconds: 0.25});
const emitter = createDynamicEmitter({
  context, destination: mixer.bus('ambience'), buffer: ambience,
  spatial: {source: {x: 0,y: 20}, listener: {x: 0,y: 0}, zone: 'forest'}
});
await emitter.start(); // call in a user gesture on mobile
emitter.update({source: {x: 15,y: 20}, listener: {x: 1,y: 0}, occlusion: 0.4, zone: 'forest'});
const music = createAdaptiveMusic({
  context, destination: mixer.bus('music'),
  stems: [
    {id:'harmony', buffer:harmony, base:1, gain:0.85},
    {id:'melody', buffer:melody, threshold:0.15, width:0.45, base:0.15},
    {id:'pulse', buffer:pulse, threshold:0.45, width:0.45}
  ]
});
await music.start();
music.setIntensity(0.8, {fadeSeconds: 1.5});
emitter.destroy();
music.destroy();
```

Emitters smooth gain, stereo position, lowpass and early reflection without restarting the buffer. Game code supplies spatial state and owns the update cadence; there is no automatic geometry, Doppler or emitter virtualization yet. Each emitter has independent nodes; use a game-side limit for large crowds. Destroy releases nodes and cancels an outstanding unlock. Nonlooping dynamic sources terminate at source end (the last reflection is not preserved); ordinary family voices retain their existing reflection-tail handling.

Loop preparation uses a raised-cosine overlap between beginning and end, shortening the clip by the overlap. The resulting seam joins originally adjacent samples rather than forcing silence. This is appropriate for continuous ambience; it does not guarantee an inaudible join for arbitrary tonal content. For rhythmically exact music, author stems at the intended length rather than independently trimming them. Mono/stereo buffers only; minimum duration must exceed twice the requested overlap.

Music stems share exact sample rate and frame count and start on a single audio-clock timestamp; intensity ramps stem gains without retriggering. Up to eight stems, gain thresholds/widths and per-track base gain. No automatic score composition, bar-quantized transitions or state-specific tempo changes yet. The composer must prepare compatible stems.

CI runs four new mock lifecycle regressions and a separate Chromium/WebKit real Web Audio matrix (offline loop render, spectral measurements of two stem mixes, live context unlock by a click, moving emitter, intensity update and restart). Browser job artifacts contain measured JSON. The continuous audition job generates an 8-second seamless rain loop, three original 16-second synchronized 120 BPM stems, and a 48-second offline preview that moves from calm to full intensity and back. The preview uses the same pure gain law; it is not a browser audio capture or an artistic approval.

### Beat/bar-quantized adaptive transitions

The default `setIntensity(value, {fadeSeconds})` remains immediate. Supply the score's BPM and meter at player creation, then optionally request a beat- or bar-aligned transition:

```js
const music = createAdaptiveMusic({context, stems, bpm:120, beatsPerBar:4});
await music.start();
music.setIntensity(0.9, {quantize:'bar', fadeSeconds:0.4});
```

The transport schedules the next grid boundary at least 30 ms ahead using the AudioContext clock. No JS timer is used for audio scheduling. The requested target is visible immediately in state.targets; state.transitionAt is the scheduled start time of the most recent transition, not a completion flag. A new request cancels prior scheduled automation, holds the computed current gain, and replaces the transition. The stems keep their original transport start time. Supply genuinely grid-aligned authored stems; the runtime does not stretch or retune arbitrary loops to match the declared BPM. The browser test also checks a real beat-quantized transition and the rendered battle frequency.

The original Chromium and WebKit Web Audio checks passed at 256358b, but upload-artifact excluded the two hidden output directories. The upload steps now explicitly permit hidden files only in the generated audio and browser report paths. The corrected CI must pass again before acceptance.

### Virtual audio world and reserved scene budget

`shared/capabilities/virtual-audio.js` adds a bounded continuous-emitter pool and an optional integration facade. Example:

```js
const scene = createBudgetedAudioScene({
  context, budget: {total:18, events:4, music:2},
  families, stems, maxSources:4096
});
await scene.music?.start();
// In the game update loop, supply a snapshot, not a node per soldier.
await scene.world.reconcile({
  listener: {x: cameraX,y: cameraY}, heading: cameraAngle,
  sources: units.map(unit => ({
    id: String(unit.id), buffer: marchLoop, position: unit.position,
    priority: unit.isCommander ? 3 : 1, volume: 0.8,
    referenceDistance: 8, maxDistance: 70, zone: 'open'
  }))
});
await scene.events.play('impact', {priority:2});
scene.music?.setIntensity(0.8, {quantize:'beat'});
scene.destroy();
```

The continuous pool ranks estimated audible gain times priority, ignores sources below a configurable floor, and gives retained sources a 15% score bonus by default to reduce churn. Stable IDs break ties. It keeps retiring voices inside the physical budget while their gain fades (35 ms automation, 50 ms default retirement interval). The caller reconciles again to release elapsed retirements and activate new candidates; no background scheduler is installed. Use a regular cadence such as 10–20 Hz and await each reconciliation; overlapping requests return false rather than queueing stale snapshots. Newly audible loops start at an offset based on the shared audio-clock origin (or explicit per-source phaseOrigin) and use a 25 ms fade-in. Buffers are supplied by the caller and can be shared across thousands of logical emitters. This is virtualization, not buffer streaming, automatic geometry occlusion, or voice aggregation.

The scene facade reserves independent fixed source quotas for continuous loops, one-shot events and music stems; unused slots are not lent between categories. The total applies only to source nodes owned by this facade, not other application audio graphs, reflection/filter nodes, or decoded memory bytes. The family cache remains count-bounded; the caller controls the continuous buffer inventory. A shared mixer supplies three independent buses. The default budget is 24 total (12 continuous, 8 events, 4 music). Scene stats expose allocations, pending events and logical count. Destroy all scene-owned nodes without closing the app's context.

The browser integration test creates 512 logical units in two distant groups, reserves 18 total slots (12 continuous, 4 events, 2 music), switches listener position between groups, checks that retiring voices never exceed the cap, tests eight simultaneous decoded combat requests (four accepted), preserves the music transport, measures real army-bus RMS and update timings, and verifies teardown. Its sounds are simple original synthetic fixtures, not approved battlefield assets; it is a technical integration scenario, not an integrated game or performance claim for a physical mobile device. Five mock/logic regressions cover ranking, retention, timing, cancellation and quota constraints. Browser CI must confirm the expanded scenario.

### Horizontal score director and musical identity auditions

Vertical intensity mixing is retained for variation within a state, not treated as proof of emotional contrast. The new independent original scores share a transformed D–E–F/F#–A–G–E–D motif, but differ in orchestration, harmony, meter, rhythm and tempo:

| State | Tempo / meter | Musical language |
| --- | --- | --- |
| peace | 76 BPM / 3/4 | D major, flute, harp, sparse cello |
| tension | 104 BPM / 5/4 | minor/chromatic harmony, cello, pizzicato, low strings and timpani |
| battle | 144 BPM / 4/4 | brass calls, string ostinato and accented timpani |
| aftermath | 68 BPM / 4/4 | cello lament, harp, minor-to-major resolution |

The CI authors MIDI via the existing Forge, renders through FluidSynth, prepares exact bar-length 48 kHz clips with short boundary fades and publishes a state graph, four clips and a sequential state-journey WAV. The journey is an offline storyboard with 0.3 s linear overlap, not a live game recording. State scores require human audition; boundary fades are not evidence of imperceptible musical loop joins. The state graph allows direct peace-to-battle for urgent events but requires aftermath when leaving battle. Independent state loops are the horizontal layer; a future composer can combine vertical stems and transition-specific bridges or stingers.

```js
const director = createScoreDirector({context, destination, graph, buffers});
await director.start(); // user gesture for real-time AudioContext
director.request('tension', {quantize:'bar', fadeSeconds:0.3});
// Call regularly from the game update loop to finalize and process a queued request.
director.update();
director.destroy();
```

The transport validates the authored frame grid to within one sample, uses the current state's tempo/meter for beat/bar scheduling, and starts a new independent clip with a two-source maximum. Requests during a transition can queue one valid successor; they do not cancel an already scheduled crossfade. Playback and fades follow the audio clock, while `update()` commits completed transitions and releases graph resources. Reserve two source slots if using this standalone director alongside a budgeted scene; it is not yet wired into that facade. No game-specific adapter or authored transition bridge/stinger has been approved yet.

Browser CI also tests actual replacement of a 220 Hz peace clip with a 440 Hz battle clip on different grids using measured spectrum, and reports 30 dense world updates each at 512, 1024 and 4096 logical sources (p50/p95/max, cap and failures). Timings measure host-side reconcile latency, not audio-thread CPU, physical-device performance or end-to-end latency. Dependency installation refreshes APT indexes and retries once after the observed stale ALSA package 404, without skipping Chromium or weakening assertions.
