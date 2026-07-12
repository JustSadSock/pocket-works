async function requestSensorPermission(EventClass) {
  if (typeof EventClass?.requestPermission !== 'function') return true;
  try {
    return await EventClass.requestPermission() === 'granted';
  } catch {
    return false;
  }
}

export function getDeviceCapabilities() {
  return {
    orientationSensor: 'DeviceOrientationEvent' in window,
    motionSensor: 'DeviceMotionEvent' in window,
    fullscreen: Boolean(document.documentElement.requestFullscreen),
    orientationLock: Boolean(screen.orientation?.lock),
    vibration: typeof navigator.vibrate === 'function',
    standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  };
}

export async function watchOrientation(callback, options = {}) {
  if (!('DeviceOrientationEvent' in window)) return null;
  const allowed = await requestSensorPermission(window.DeviceOrientationEvent);
  if (!allowed) return null;

  const controller = new AbortController();
  const signal = options.signal || controller.signal;
  const handler = (event) => callback({
    alpha: event.alpha,
    beta: event.beta,
    gamma: event.gamma,
    absolute: event.absolute,
    sourceEvent: event
  });

  window.addEventListener('deviceorientation', handler, { passive: true, signal });
  return () => controller.abort();
}

export async function watchMotion(callback, options = {}) {
  if (!('DeviceMotionEvent' in window)) return null;
  const allowed = await requestSensorPermission(window.DeviceMotionEvent);
  if (!allowed) return null;

  const controller = new AbortController();
  const signal = options.signal || controller.signal;
  const handler = (event) => callback({
    acceleration: event.acceleration,
    accelerationIncludingGravity: event.accelerationIncludingGravity,
    rotationRate: event.rotationRate,
    interval: event.interval,
    sourceEvent: event
  });

  window.addEventListener('devicemotion', handler, { passive: true, signal });
  return () => controller.abort();
}

export async function enterFullscreen(element = document.documentElement) {
  if (document.fullscreenElement) return true;
  if (!element?.requestFullscreen) return false;
  try {
    await element.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen() {
  if (!document.fullscreenElement) return true;
  if (!document.exitFullscreen) return false;
  try {
    await document.exitFullscreen();
    return true;
  } catch {
    return false;
  }
}

export async function toggleFullscreen(element = document.documentElement) {
  return document.fullscreenElement ? exitFullscreen() : enterFullscreen(element);
}

export async function lockOrientation(type) {
  if (!screen.orientation?.lock) return false;
  try {
    await screen.orientation.lock(type);
    return true;
  } catch {
    return false;
  }
}

export function unlockOrientation() {
  try {
    screen.orientation?.unlock?.();
    return true;
  } catch {
    return false;
  }
}
