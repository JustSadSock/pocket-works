# Skill: Motion, Game Feel and Tactile Feedback

Use whenever the task includes animation, interaction polish, combat feedback, camera feel, transitions, VFX or sound-linked response.

## 1. Attach feedback to events

Create explicit events such as:
- press;
- drag start/end;
- confirm;
- error;
- pickup;
- hit;
- block;
- land;
- fire;
- build complete;
- level up;
- death.

Feedback should subscribe to meaningful events rather than be scattered as arbitrary animation code.

## 2. Layer 2–3 channels first

Possible channels:
- motion/tween;
- scale/squash;
- color/flash;
- particles;
- camera response;
- hit-stop;
- sound;
- haptic feedback where available;
- numeric/text pop.

Start with a small stack. Add only if the action is still unreadable or underpowered.

## 3. Use intensity tiers

Define small/medium/large response presets so the whole product has a consistent physical scale.

Example:
- small: button press, minor pickup;
- medium: ability cast, construction complete;
- large: boss hit, level completion, major failure.

Do not use large shake/flash for routine input.

## 4. Easing is meaning

Avoid linear interpolation for expressive movement.

Use:
- ease-out for settling into place;
- overshoot/spring for pop;
- ease-in for anticipation;
- damped spring for dragged/released physical controls;
- custom curves for heavy vs light objects.

Object mass should be visible in timing.

## 5. Anticipation and follow-through

A satisfying action often has:
1. short anticipation;
2. main action;
3. impact/read frame;
4. settle/follow-through.

Even 80–200 ms of well-chosen anticipation/settle can outperform a pile of particles.

## 6. Hit-stop and shake are scarce

- Keep hit-stop very short and tied to importance.
- Camera shake affects the visual camera, not gameplay coordinates.
- Use directional shake when the force has a direction.
- Add trauma/decay rather than resetting a random offset every frame.
- Avoid shake during precision input unless the game design explicitly tolerates it.

## 7. Secondary motion sells life

Use subtle delayed motion on:
- clothing;
- feathers;
- tails;
- foliage;
- suspended props;
- UI ornaments;
- camera lag;
- weapon follow-through.

Secondary motion should be driven by the primary movement, not unrelated looping noise.

## 8. Transition continuity

A transition should explain where content went or came from.

Prefer spatial continuity:
- panel expands from its source;
- card moves into detail view;
- world zooms toward a selected location;
- inventory item flies to a slot;
- completed object settles into the world.

Avoid arbitrary fades for every navigation state.

## 9. Audio and motion timing

For short interactions, perceived quality often depends more on synchronization than sound fidelity.

Align:
- transient sound with contact/impact;
- rising sound with anticipation;
- low-frequency emphasis with large mass;
- UI click with actual activation, not touch-down if cancellation is possible.

Use controlled variation for repeated sounds.

## 10. Respect input latency

Visual response to touch/press should begin immediately. Do not wait for long decorative sequences before acknowledging input.

Functional state changes should not be blocked by non-essential animation.

## 11. Reduced motion

Under `prefers-reduced-motion`:
- remove non-essential parallax and shake;
- reduce travel distance;
- shorten or replace large transforms with opacity/instant state;
- preserve necessary state feedback.

## Done condition

The user can infer cause, weight, success/failure and relative importance from motion/feedback alone, while repeated actions remain comfortable rather than exhausting.
