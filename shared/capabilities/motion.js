const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

export function prefersReducedMotion() {
  return reducedMotionQuery.matches;
}

export function watchReducedMotion(callback) {
  const emit = () => callback(reducedMotionQuery.matches);
  reducedMotionQuery.addEventListener?.('change', emit);
  emit();
  return () => reducedMotionQuery.removeEventListener?.('change', emit);
}

export function animateValue(options = {}) {
  const {
    from = 0,
    to = 1,
    duration = 220,
    easing = (t) => 1 - Math.pow(1 - t, 3),
    onUpdate = () => {},
    onComplete = () => {},
    signal
  } = options;

  if (signal?.aborted) return { cancel() {} };
  if (prefersReducedMotion() || duration <= 0) {
    onUpdate(to, 1);
    onComplete(to);
    return { cancel() {} };
  }

  let frame = 0;
  let cancelled = false;
  const startedAt = performance.now();

  const cancel = () => {
    cancelled = true;
    if (frame) cancelAnimationFrame(frame);
  };

  signal?.addEventListener('abort', cancel, { once: true });

  const tick = (now) => {
    if (cancelled) return;
    const progress = Math.min(1, (now - startedAt) / duration);
    const value = from + (to - from) * easing(progress);
    onUpdate(value, progress);
    if (progress >= 1) {
      onComplete(to);
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return { cancel };
}

export function animateSpring(options = {}) {
  const {
    from = 0,
    to = 1,
    velocity = 0,
    stiffness = 260,
    damping = 28,
    mass = 1,
    precision = 0.001,
    onUpdate = () => {},
    onComplete = () => {},
    signal
  } = options;

  if (signal?.aborted) return { cancel() {} };
  if (prefersReducedMotion()) {
    onUpdate(to, 0);
    onComplete(to);
    return { cancel() {} };
  }

  let current = from;
  let currentVelocity = velocity;
  let previousTime = performance.now();
  let frame = 0;
  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    if (frame) cancelAnimationFrame(frame);
  };

  signal?.addEventListener('abort', cancel, { once: true });

  const tick = (now) => {
    if (cancelled) return;
    const delta = Math.min(0.032, Math.max(0.001, (now - previousTime) / 1000));
    previousTime = now;

    const displacement = current - to;
    const acceleration = (-stiffness * displacement - damping * currentVelocity) / mass;
    currentVelocity += acceleration * delta;
    current += currentVelocity * delta;
    onUpdate(current, currentVelocity);

    if (Math.abs(currentVelocity) <= precision && Math.abs(to - current) <= precision) {
      onUpdate(to, 0);
      onComplete(to);
      return;
    }

    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return { cancel };
}

export function createRafLoop(step, options = {}) {
  if (typeof step !== 'function') throw new TypeError('createRafLoop requires a step function');

  const {
    autoStart = true,
    pauseWhenHidden = true,
    maxDelta = 64
  } = options;

  let frame = 0;
  let running = false;
  let previousTime = 0;

  const tick = (now) => {
    if (!running) return;
    const delta = previousTime ? Math.min(maxDelta, now - previousTime) : 0;
    previousTime = now;
    step(now, delta);
    frame = requestAnimationFrame(tick);
  };

  const start = () => {
    if (running || (pauseWhenHidden && document.hidden)) return;
    running = true;
    previousTime = 0;
    frame = requestAnimationFrame(tick);
  };

  const stop = () => {
    running = false;
    previousTime = 0;
    if (frame) cancelAnimationFrame(frame);
  };

  const visibilityHandler = () => {
    if (!pauseWhenHidden) return;
    if (document.hidden) stop();
    else start();
  };

  document.addEventListener('visibilitychange', visibilityHandler);
  if (autoStart) start();

  return {
    start,
    stop,
    get running() {
      return running;
    },
    destroy() {
      stop();
      document.removeEventListener('visibilitychange', visibilityHandler);
    }
  };
}
