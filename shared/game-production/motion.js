/** Deterministic gameplay timing around engine-owned AnimationGroups. Call update(deltaMs) from the game loop. */
export function createMotionController({ clips, actions = {}, onEvent = () => {}, blendMs = 140, reducedMotion = false }) {
  if (!clips || typeof clips !== 'object') throw new TypeError('clips are required');
  let state = null;
  let previous = null;
  let blendElapsed = 0;
  let active = null;
  let pauseRemaining = 0;

  function play(name, loop = true) {
    const clip = clips[name];
    if (!clip) throw new Error(`Missing animation clip: ${name}`);
    clip.play(loop);
    clip.setWeightForAllAnimatables?.(0);
  }
  function setState(name, { loop = true, immediate = false } = {}) {
    if (state === name) return;
    if (!clips[name]) throw new Error(`Missing animation clip: ${name}`);
    if (previous && previous !== state) clips[previous]?.stop();
    previous = state;
    state = name;
    blendElapsed = immediate || reducedMotion ? blendMs : 0;
    play(name, loop);
    if (blendElapsed >= blendMs) finishBlend();
  }
  function finishBlend() {
    clips[state]?.setWeightForAllAnimatables?.(1);
    if (previous && previous !== state) clips[previous]?.stop();
    previous = null;
  }
  function trigger(name) {
    const definition = actions[name];
    if (!definition || !Array.isArray(definition.phases) || !definition.phases.length) throw new Error(`Unknown action: ${name}`);
    if (active && definition.interrupt !== true) return false;
    if (active) onEvent({ type: 'interrupt', action: active.name });
    active = { name, definition, phase: -1, elapsed: 0, events: new Set() };
    startNextPhase();
    return true;
  }
  function startNextPhase() {
    if (!active) return;
    active.phase++;
    active.elapsed = 0;
    active.events.clear();
    const phase = active.definition.phases[active.phase];
    if (!phase) {
      const { name, definition } = active;
      active = null;
      if (definition.returnTo) setState(definition.returnTo);
      onEvent({ type: 'complete', action: name });
      return;
    }
    if (!Number.isFinite(phase.duration) || phase.duration <= 0 || !clips[phase.clip]) throw new Error(`Invalid phase in action ${active.name}`);
    setState(phase.clip, { loop: false });
    onEvent({ type: 'phase', action: active.name, phase: active.phase });
  }
  function update(deltaMs) {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('deltaMs must be finite and nonnegative');
    let remaining = Math.min(deltaMs, 250);
    if (pauseRemaining) {
      const paused = Math.min(remaining, pauseRemaining);
      pauseRemaining -= paused;
      remaining -= paused;
      if (!pauseRemaining) for (const clip of Object.values(clips)) clip.speedRatio = 1;
    }
    if (!remaining) return;
    if (previous) {
      blendElapsed += remaining;
      const t = Math.min(1, blendElapsed / Math.max(1, blendMs));
      clips[state]?.setWeightForAllAnimatables?.(t);
      clips[previous]?.setWeightForAllAnimatables?.(1 - t);
      if (t === 1) finishBlend();
    }
    // Carry unused time into the next phase so low frame rates cannot skip contacts.
    while (active && remaining > 0) {
      const phase = active.definition.phases[active.phase];
      const before = active.elapsed;
      const step = Math.min(remaining, phase.duration - before);
      active.elapsed += step;
      remaining -= step;
      for (let i = 0; i < (phase.events ?? []).length; i++) {
        const event = phase.events[i];
        if (event.at >= before && event.at <= active.elapsed && !active.events.has(i)) {
          active.events.add(i);
          onEvent({ ...event, action: active.name, phase: active.phase });
          if (event.hitStopMs && !reducedMotion) {
            pauseRemaining = Math.min(180, Math.max(0, event.hitStopMs));
            for (const clip of Object.values(clips)) clip.speedRatio = 0;
          }
        }
      }
      if (active.elapsed >= phase.duration) startNextPhase();
      if (pauseRemaining) break;
    }
  }
  function dispose() {
    for (const clip of Object.values(clips)) { clip.speedRatio = 1; clip.stop(); }
    state = previous = active = null;
    pauseRemaining = 0;
  }
  return { setState, trigger, update, dispose, get state() { return state; }, get action() { return active?.name ?? null; } };
}
