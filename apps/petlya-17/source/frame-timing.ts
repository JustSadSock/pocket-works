// Keep the integrator stable without coupling normal simulation time to FPS.
export const MAX_PHYSICS_STEP = 0.05;
export const MAX_FRAME_CATCHUP = 0.25;

export function frameTiming(elapsedMs: number) {
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs / 1000 : 0;
  const simulated = Math.min(elapsed, MAX_FRAME_CATCHUP);
  const steps = Math.ceil(simulated / MAX_PHYSICS_STEP);
  return {
    elapsed,
    simulated,
    steps,
    stepSeconds: steps ? simulated / steps : 0,
    presentationSeconds: Math.min(elapsed, MAX_PHYSICS_STEP)
  };
}

export function measuredFps(frames: number, elapsedSeconds: number): number {
  return elapsedSeconds > 0 ? frames / elapsedSeconds : 0;
}
