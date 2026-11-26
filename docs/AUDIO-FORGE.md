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

### Authored musical bridges within the scene budget

The score graph now supports an optional `bridges` map keyed by "from:to". Supply decoded bridge audio in the same format as the destination clip via `bridgeBuffers`. Each bridge is bounded to 15 seconds. The director prepares a composite buffer containing the one-shot bridge followed by the destination loop, and sets the source loop boundaries to exclude the bridge. The destination beat clock begins at the end of the bridge. No third source is required during the transition. The extra composite PCM allocation is temporary and not covered by the source-count quota; a future memory budget must account for this. Requests can still queue one successor and cannot interrupt an already scheduled bridge. The director's state.bridgeUntil is the associated bridge end timestamp, not a boolean playback status.

```js
const scene = createBudgetedAudioScene({
  context, budget:{total:18,events:4,music:2}, families,
  score:{graph,buffers,bridgeBuffers}
});
await scene.music.start();
scene.music.request('tension',{quantize:'bar',fadeSeconds:0.3});
// Game tick:
scene.music.update();
scene.destroy();
```

Horizontal score and vertical stems are mutually exclusive within this facade for now; two music slots are required for horizontal playback. The browser integration verifies the bridge tone before the destination, its absence after the destination loops, and the scene quota during transition. The CI produces four original bridge phrases (peace→tension, tension→battle, battle→aftermath, aftermath→peace) and a separate bridge-journey listening proof, retaining the original crossfade-only control. Neither the authored bridges nor the resulting music have received artistic approval. The proof is offline, while browser checks use test tones; real score playback in an actual game is still a separate integration milestone.

At f3d09d8 both browsers passed 30 dense updates at each of 512/1024/4096 sources with zero activation failures and 12 continuous voices maximum. Chromium p95: 0.9/0.6/3.3 ms; WebKit p95: 1/1/2 ms. These are host-side timings on CI runners, not audio-thread profiling.

### Retained PCM budgets and musical stingers

The family player has a default `maxDecodedBytes` of 64 MiB. It counts unique retained decoded PCM buffers (four bytes per frame per channel), including buffers used by currently active voices and reflection tails even if removed from the cache. Ready inactive cache entries may be evicted to admit new audio. Oversized or currently unaffordable buffers are rejected. Stats expose decodedBytes and maxDecodedBytes. This is a retained-PCM accounting limit, not a process-memory limit: browser decoder scratch space, in-flight network buffers, transient decoded results, garbage collection and native audio graph memory are not bounded by it.

The horizontal director accepts `maxDecodedBytes` (default 128 MiB). It checks unique state/bridge PCM plus a conservative reservation for two copies of the largest possible bridge+destination composite before allocating audio nodes. The reservation is an upper bound for the director's accounted live buffers, not an observed process RSS. The scene exposes maxEventDecodedBytes, maxScoreDecodedBytes, eventDecodedBytes and scoreReservedBytes. Caller-owned world buffers and vertical stems are not yet covered by this memory policy.

```js
const scene = createBudgetedAudioScene({
  context, families, score,
  budget:{total:18,events:4,music:2},
  maxEventDecodedBytes:32*1024*1024,
  maxScoreDecodedBytes:96*1024*1024,
  stingers:{
    victory:{url:'audio/victory.wav',gain:0.8,priority:8,cooldown:3}
  }
});
await scene.playStinger('victory');
```

Stingers use the existing one-shot quota/cache, with no random detuning or gain jitter, and a per-ID cooldown measured on the audio clock. Concurrent duplicate requests are rejected. They do not restart the score. They are immediate event reactions after decode (preload through the family player if required); no harmonic transposition, bar scheduling, reserved stinger-only slot or automatic music ducking yet. The original score package now renders three additional authored stingers: victory, defeat and discovery. Artistic audition is required.

At fdc77e1 the actual browser bridge checks passed in Chromium and WebKit: during bridge ~-35.61 dB; after destination loop ~-117.6 dB. Both 4096-source stress sweeps had zero activation failures and a 12 continuous-source cap. P95 3.4/2 ms respectively. The unrelated Validate Pocket Works WebKit landscape job failed to fetch an obsolete ALSA package (HTTP 404); the same APT index refresh and bounded dependency retry used by the Audio Forge workflow has been added to validate.yml without weakening test requirements.

### Context-aware musical reactions and ducking

Optional stinger configuration now includes `states` (allowed horizontal score state IDs), `duckGain` (0–1, default 1, no attenuation), and `duckHold` (minimum hold seconds). The scene exposes `preloadStinger(id)` and `playStinger(id)`. An allowlisted reaction is rejected during pending state transitions or a bridge, and admission is checked again after asynchronous decoding. This is an author-supplied compatibility rule, not automatic harmonic analysis. Reactions without an allowlist preserve the earlier behaviour.

On successful playback only, a separate gain stage attenuates the music bus with a 35 ms attack, hold for the actual decoded playback duration (or configured minimum), and 180 ms release. Overlapping reactions conservatively preserve the strongest attenuation until the longest hold ends. User volume is unaffected; an interrupted/stolen reaction may retain its nominal duck envelope. No new source slot is required. `scene.stats.musicDucking` reports computed envelope gain and end time. Example:

```js
stingers: {
  discovery: {url:'audio/discovery.wav', states:['peace'], duckGain:0.35, duckHold:0.4, cooldown:2}
}
```

The browser fixture now checks a real spectrum recovery of more than 6 dB, preloading, cooldown and state rejection. Mock regression coverage includes overlap, release, asynchronous admission and invalid input. At 4141d1e the previous native browser checks passed with 8,820 bytes retained effects PCM and 1,632,000 bytes score reservation in each engine. The independent platform quality gate rejected the separated Playwright install commands, so validate.yml now retries the original required `npx playwright install --with-deps chromium webkit` command after refreshing APT; the validator is unchanged.

### Unified horizontal and vertical adaptation

The existing score director now accepts optional state-specific `layers` and initial `intensity`. Each layer must match its state's base buffer sample rate and frame count exactly; each can specify the existing stem gain law (base, threshold, width, gain). Source voices within one state start on the same audio-clock timestamp. A state transition crossfades the entire outgoing and incoming groups, not just the base. When a bridge is present, it is played in the base source while the extra layers have equal-length silent prefixes. All incoming sources loop only the destination portion.

```js
const scene = createBudgetedAudioScene({
 context, families, budget:{total:20,events:4,music:4},
 score:{graph,buffers,bridgeBuffers,
   layers:{
    peace:[{id:'cello',buffer:peaceDetail,threshold:0.1,width:0.8,gain:0.55}],
    battle:[{id:'ostinato',buffer:battleDetail,threshold:0.1,width:0.8,gain:0.55}]
   },intensity:0.2}
});
await scene.music.start();
scene.music.setIntensity(0.85,{quantize:'beat',fadeSeconds:0.4});
scene.music.request('battle',{quantize:'bar',fadeSeconds:0.3});
scene.music.update();
```

The director checks the maximum sum of source counts for all allowed graph edges before allocating nodes; one base plus one detail per state requires four music slots during a transition. The scene passes its reserved music quota into the director. Optional layers are counted in unique base PCM and the conservative two-group bridge-composite reservation. The score transport keeps the global requested intensity, applies it to new states, and can update current and scheduled groups without restarting them. Each group uses its own musical grid for quantized gain changes. This is not dynamic composition synthesis or automatic arrangement selection.

The score-state recipe also renders eight independently mixed base/detail WAVs (two per state) while preserving all previous control assets. The graph's `adaptive` entries describe these files; application code loads the base files into `buffers` instead of the original full mixes and maps each detail file to `layers`. The new adaptive-journey WAV is an offline storyboard using the actual layer gain law and the existing authored bridges, not a native browser recording. Independent normalization of the stem groups intentionally changes their balance relative to the original full mix; artistic approval is still needed. The current browser fixture uses distinct tones to verify the two state-specific layers, muting within the destination, silence during the bridge, and the four-slot music quota. Seven score regression scenarios were checked with mock nodes before native CI.

At 2d5614b native ducking recovered 9.11866/9.11863 dB in Chromium/WebKit, consistent with the configured gain 0.35. Both browsers passed, including the 4096-source stress test. The prior Validate health failure is resolved; remaining platform matrix checks must complete separately.

### Verified authored score packages

`score-pack.js` loads the version-1 graph and metrics emitted by the Forge. It selects base/detail stems by default, or original full mixes with adaptive:false, plus authored bridge assets. It checks relative asset paths, frame counts, exact 48 kHz stereo PCM16 WAV headers and SHA-256 against the supplied trusted metrics. It converts PCM to AudioBuffers at the authored 48 kHz grid even when the device AudioContext runs at 44.1 kHz. This avoids a decodeAudioData resampling round-off at bar boundaries. Requires a secure context for Web Crypto (localhost or HTTPS). The manifest and metrics themselves must come from a trusted source; hashes are integrity checks, not signatures.

```js
const score = await loadForgeScore({
  context, graph, metrics, baseUrl: new URL('audio/score/', location.href).href,
  maxDecodedBytes: 128*1024*1024, signal
});
const scene = createBudgetedAudioScene({
  context, budget:{total:18,events:4,music:4}, families, score
});
await scene.music.start();
```

The loader preflights unique source PCM and two worst-case bridge composite groups before any fetch, then downloads sequentially and verifies each payload. It accepts only the Forge canonical 44-byte header, not arbitrary WAV containers or compressed formats. It does not load stingers or the offline audition mixes. It bounds retained PCM estimates, not network/decoder transient allocations or overall browser process memory. On failed or cancelled load no usable partial score is returned; caller can retry. At 394004a the actual 12-file adaptive pack has 48,143,472 bytes base PCM and 81,086,640 bytes reserved including bridge composites. A local Node 22.16 check of the exact repository loader against that downloaded CI artifact passed all 12 checks, rejected a smaller memory quota before fetching and rejected deliberately corrupted audio. The context was mocked; actual browser playback is separately tested.

The browser matrix now depends on the same-run platform-smoke output and downloads its generated score artifact. A second browser test loads the actual authored score into the budgeted scene, verifies memory parity, plays peace → tension → battle → aftermath → peace, measures output RMS and checks the four-voice cap and unchanged transport clocks while varying intensity. Previous synthetic spectral tests are retained. The authored test is a technical integration proof, not a recording, artistic approval or an integration into any game. At 394004a all four primary workflows passed, including 12/12 Validate jobs, both synthetic unified composer browser checks, and all 22 authored WAV hashes.

### Banners of War adapter (research-only staging)

The first game adapter is staged in `tools/audio-forge/adapters/banners-of-war.js`. It is not imported by any published app and does not include an audio asset pack. The original game contract was inspected at Banners PR #1355 HEAD 5cf0a72622621ac0dc0d5e1a88cbd9a0369e2616, `apps/banners-of-war/research/battlefield-identity/battle-audio.js`. The caller supplies the game's existing `audible(F,s,u)` and `soundEvents(F,s,cam,prior,dt)` exports, rather than reimplementing the simulation or event extraction. The game branch remains unchanged.

```js
const adapter = createBannersAudioAdapter({
  context, destination, F, soundEvents, audible,
  assets: approvedAssets // {approved:true,families,ambient,score,stingers}
});
await adapter.unlock(); // in a user gesture
// Call update at a bounded cadence (e.g. 10–20 Hz):
await adapter.update(snapshot,camera,{active:true,playing:true,speed:1});
// Public result screen (not inferred from hidden units):
await adapter.update(snapshot,camera,{active:true,playing:false,outcome:'victory'});
adapter.configure({muted:false,fx:0.65,ambient:0.4,music:0.55});
adapter.reset(); // on battle replacement/seek
adapter.destroy();
```

Asset approval is an explicit caller assertion, not an automated art decision. No built-in URLs or unapproved assets are included. Families accept the seven legacy event names and optional exact variant keys such as step:2. The adapter preserves the legacy camera pan and speed-scaled gain/rate; family settings can disable extra pitch/gain jitter. Wind, water and forest loops use the original terrain-based level laws. It owns neither the context nor the application's settings persistence/capture destination. Caller must attach those and use one audio backend at a time.

Only units admitted by the actual game visibility rule are considered for music and effects. The latest visible-ID set and update epoch are rechecked after asynchronous effect decoding to prevent stale sounds. One-shot requests do not block the game update on network/decode; overlapping update calls return false. Pausing resets event history, seek/discontinuity resets the score, inactive screens mute the buses and retire the ambience, while the score clock may continue. Music requests use the existing graph; visible nearby contacts drive battle, nearby visible opponents tension, six simulated seconds of aftermath follow contact loss, and only an explicit public result can request a victory/defeat reaction. A result reaction is attempted once when the aftermath state is settled, including on the stopped simulation's result screen; a result that never reaches aftermath does not force a stinger. This policy is a first candidate, not gameplay or artistic approval.

Four mock regression scenarios passed, plus an isolated execution with the actual pinned game extractor. Native CI checks out only the pinned audio-contract source in a separate directory and tests actual event extraction, fog isolation, playback and teardown with synthetic technical fixtures. The full game and its published runtime are deliberately not changed.

At Sound Forge HEAD 00a9246, both Chromium and WebKit passed the authored 12-file musical journey. The 44.1 kHz contexts retained the 48 kHz authored buffer grid, 81,086,640-byte reserved PCM and four-voice transition cap. Load times were 320.9 and 209 ms respectively on CI runners. All five requested state visits produced nonzero measured audio and preserved the transport while changing intensity. These are technical results, not human listening or game artistic approval.

### Artistic laboratory: expressive performance and material library

The next audition is separate from the established score package and the Banners adapter. `artistic-lab.mjs` authors three original compositions, each rendered with the same notes, programs, timing and seed as a control/expressive pair:
- Moorland: 96 BPM, 3/4, eight bars, modal pipe/flute dialogue over a drone and plucked accompaniment.
- Last Standard: 72 BPM, 3/4, eight bars, cello lament, chromatic harmony and answering horn.
- Iron Horizon: 126 BPM, 4/4, sixteen bars, brass calls, changing ostinato, bass and timpani, with a contrasting second section.

The expressive variants use instrument-specific note-level CC11 envelopes, vibrato and small attack bends on monophonic melody channels. They intentionally do not use overlapping pitch-bent notes or claim true sampled legato/portamento. A General MIDI SoundFont remains the source timbre; expressive automation does not make it a new acoustic instrument. The three matched controls remain unchanged. The catalog step additionally creates sequential RMS-matched A/B files (control first, 0.7 s silence, expressive second), attenuating the louder member rather than increasing either peak. RMS matching is not perceptual loudness matching.

Four dry original material models (boot-earth, hoof-earth, armor-leather, shield-wood) each render six seeded variants. Heel/toe, paired hoof impacts, irregular armor/leather contact and damped wooden-core impact use distinct envelopes and spectra. All 24 were checked twice in an isolated JS execution for exact repeatability, finite PCM and nonzero energy; max sample peak 0.865782. The three expressive scores compiled 2,226 / 4,170 / 4,879 expression events with all notes within the intended grid. These are pre-render checks, not artistic ratings.

`artistic-catalog.mjs` measures all 30 rendered files, rejects clipped/silent results, registers the 24 original procedural effects in a separate SQLite/FTS research vault, verifies every hash, and checks search results for earth and shield wood. Each entry carries original provenance, recipe seed/strength, taxonomy tags and research-only approval metadata. Music is not imported as an original sample into the library because it uses a SoundFont. No external recordings or new paid tools are added by this iteration. The separate CI artifact includes the manifest, generated files, comparison files, metrics and vault; no production asset approval or game changes result from generation.

At 89e6825 the first Banners adapter native checks passed in Chromium and WebKit using the pinned game extractor and synthetic fixtures: one admitted step event, one continuous ambient source, hidden enemy excluded, and cleanup verified. The actual authored score journey also passed again. Full game integration and listening acceptance remain separate.

### Original plucked instrument laboratory

The next artistic candidate no longer relies exclusively on General MIDI. `plucked-instruments.mjs` implements two original, sample-free plucked-string profiles (lute and harp) with fractional-delay feedback, frequency-dependent lowpass phase compensation, seeded pluck-position excitation, velocity-dependent spectrum/amplitude, resonant body filters and damping/release. These are simplified physical models, not recordings or validated reconstructions of historical instruments. The note range is MIDI 36–84. They are dry and use no external data.

The research-only string lab renders 18 standalone notes: two instruments, three A pitches (MIDI 45/57/69) and three velocities (0.3/0.6/0.9), with seed/provenance, SHA-256, taxonomy and original-synthesis license metadata in a separate SQLite/FTS library. These are sample candidates, not a complete multisampled instrument or a production-approved library. The library verifies all stored files and search counts. It does not combine the two research vaults.

River Crossing is a new 12-bar, 92 BPM, 3/4 duet with 108 notes, a contrasting middle phrase and returning cadence. The original waveguide arrangement and a General MIDI guitar/harp proxy use matching pitch, note onset and duration instructions; render envelopes, synthesis dynamics and timbre differ. The control is trimmed/padded to the exact 48 kHz frame grid and the sequential A/B is RMS-matched by attenuation (GM first, 0.7 s gap, physical second). The GM nylon guitar is a proxy for lute, not an actual lute recording. No automatic musical or artistic acceptance is claimed.

Pre-CI isolated JS checks exercised the three new regression scenarios (pitch, velocity/profile differentiation, exact arrangement grid) using the actual source, with a substitute hash in the test harness. Separate full arrangement rendering twice yielded 1,126,957 stereo frames, bit-identical Float32 PCM, peak 0.389875 and RMS 0.029095; the eight tuning probes (MIDI 45,57,69,81 for each profile, one seed/velocity) had a maximum absolute interpolated-autocorrelation error of 0.187 cents. These are narrow numerical tests, not subjective instrument realism. Native Node tests and the full artifact render run in CI.

At 640fc42 all four main workflows passed, including 12/12 Validate jobs and both browser matrices. Artistic Laboratory artifact 15126407597 was downloaded and independently checked: 30 primary WAVs and three A/B WAVs matched all 33 recorded SHA-256 values; SQLite integrity check passed and all 24 effect vault object hashes matched. The prior controls remain preserved. No game branch, approved assets, production bundle or paid service has been changed.
