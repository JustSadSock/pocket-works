# Animation & Game Feel Studio — Stage III

An app-owned production protocol, not a shared animation style or gameplay engine.
Copy `tools/animation-studio/runtime/*.mjs` into the owning app (or bundle them at
build time). Do not reference production files under `/tools/`; each app owns its
offline cache. No renderer/audio library dependency is added by the runtime.

## Clip v1: seconds and semantic events

```json
{
  "version": 1,
  "id": "Strike",
  "duration": 1,
  "loop": false,
  "events": [{"time": 0.28, "name": "release"}, {"time": 0.5, "name": "contact"}],
  "tracks": [{"id": "height", "type": "value", "keys": [
    {"time": 0, "value": 0, "ease": "smooth"},
    {"time": 0.5, "value": 1, "ease": "smooth"},
    {"time": 1, "value": 0}
  ]}]
}
```

`frames` tracks hold `frames: [{rect:[x,y,width,height], duration:seconds}]`.
Their durations must sum to the clip duration. `skeletal` tracks bind a named
`action`, `fps` and `startFrame`. `value` tracks use increasing time/value keys,
with outgoing `linear`, `smooth` or `hold` interpolation. Track IDs are unique.
Events are ordered; same-time events retain author order. Event payloads are
app data, never executable commands. Validate loaded clips before rendering.

`Timeline.play(clip,{fade})`, `advance(dt)`, `pause()`, `resume()`, `setSpeed()`
and `cancel()` own the presentation clock. `seek()` samples silently: it does
not issue impacts or sounds. Replacement cancels old events immediately;
generation IDs allow a consumer to stop the interrupted voice/effect. Outgoing
poses may remain during a cross-fade but never emit events. Value tracks blend;
frame tracks use the new pose; renderer-specific skeletal blending remains the
app's responsibility. `bindSkeletal()` samples a real paused Babylon animation
group using its imported native frame range. It is not a second clock.

Elapsed suspension debt over 250ms is discarded, recorded as `droppedTime`, and
never replayed as a burst of queued feedback. Reset the wall clock after tab
visibility changes, pause rendering while hidden and preserve explicit user
pause. Play speed scales animation/event time, not spring mass or audio pitch.
This is a presentation timeline, **not authoritative gameplay**: game rules
validate contacts/hits independently and can cancel a presentation action.

## Production via Universal Art Forge v2

Two additional adapters preserve existing v1/v2 manifests:

| Adapter | Editable source | Exports |
| --- | --- | --- |
| `frames` | JSON plus declared PNG frame inputs | PNG atlas + clip v1 JSON |
| `bake-sequence` | Packed animated BLEND with authored camera | PNG atlas + clip v1 JSON |

Both require exact output roles `image` and `clip`, plus dimension/byte budgets.
Frame inputs may come from Krita/Pixelorama frame exports, authored SVG jobs or
other editors. The adapter does not invent in-between drawings. Preserve a
consistent frame canvas/pivot; rejected mismatches must be corrected at source.

Frame source:

```json
{"version":1,"id":"Peck","loop":false,
 "frames":[{"input":"public/assets/pose-0.png","duration":0.2},
           {"input":"public/assets/pose-1.png","duration":0.3}],
 "events":[{"time":0.2,"name":"contact"}]}
```

Declare every PNG in the job's `inputs` and every producer in `dependsOn`.
`bake-sequence` parameters: `start`, `end`, `step` integer Blender frames,
`fps`, `width`, `height`, `samples`, `id`, `loop`, ordered `events`. For example
frames 1–25 step 2 at 24fps yield thirteen 2/24-second poses. The final pose
holds for one sample interval. Align event seconds to `(frame-start)/fps`.
Source rendering FPS and the requested clip FPS must reflect the intended
motion speed. Limits: 128 exported frames, 2048px source frames, 4096px atlas;
normal Art Forge staging, freshness, path isolation and rollback still apply.
Animated GLB authoring uses the existing `blender` adapter with
`validation: {requireArmature:true, requireAnimation:true}` and independent
re-import. No character rig is faked from runtime unrelated primitives.

## Physical response, VFX and sound

`Spring` is an analytic damped physical response with mass, stiffness, damping,
position, velocity, target and impulse. Its result is independent of frame
partition for a constant target. Under-, critical- and over-damping are tested.
App code supplies collisions/contacts; this is not a collision/rigid-body solver.
Seeded bounded impact particles are secondary presentation, not gameplay.

`EventAudio` consumes actual decoded Audio Forge WAV/OGG buffers. Unlock audio
on a user gesture; a denied/unsupported audio context never blocks motion.
Schedule only a crossed event at the audio context's current time. Cancel voices
by generation; cap simultaneous voices; apply controlled pitch variation.
No deferred future source is left behind by cancellation or pause.

Reduced motion preserves essential poses/contact state but removes secondary
particles and camera disturbance. Apps must set an appropriate distance/timing
policy for their own product. Do not change rules or delay input for decoration.

## Evidence and acceptance

`npm run test:motion` checks protocol, timing, cancellation, sampling, value
blending, physical stability and audio scheduling. The Animation Studio CI
builds original editable sources through real Inkscape, Blender and Audio Forge;
loads drawn poses, a weighted animated GLB, contact physics and a genuinely
baked animation on Chromium/WebKit × portrait/landscape. It records first,
anticipation, contact and settled frames plus video, event/audio dispatch times,
frame intervals, cancellation/replacement, pause/speed, reduced motion and
offline reload. A successful build does not constitute visual sign-off: inspect
recorded timing and actual frames on the final tested tree before merge.

This stage is production infrastructure and distinct capability scenes, not a
full character-animation package, automatic foot IK, professional hand-painting,
or Stage IV autonomous visual criticism. Demonstration games ship separately.
