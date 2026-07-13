// Runtime-safe CSS variable bridge for the analog controls.
shpRenderPrecisionControls = function shpRenderPrecisionControlsSafe() {
  const arc = document.querySelector('#steeringArc');
  const gate = document.querySelector('#powerGate');
  if (arc) {
    const travel = Math.min(window.innerWidth * 0.17, 70);
    const steer = clamp(shpAnalog.steer, -1, 1);
    arc.style.setProperty('--steer-offset', `${steer * travel}px`);
    arc.style.setProperty('--steer-angle', `${steer * 16}deg`);
    arc.style.setProperty('--steer-arc-y', `${(1 - Math.abs(steer)) * 31}px`);
    arc.setAttribute('aria-valuenow', String(Math.round(steer * 100)));
  }
  if (gate) {
    const value = shpAnalog.throttle > 0
      ? 0.60 - shpAnalog.throttle * 0.54
      : shpAnalog.brake > 0
        ? 0.66 + shpAnalog.brake * 0.31
        : 0.62;
    gate.style.setProperty('--power-top', `${clamp(value, 0.04, 0.97) * 100}%`);
    gate.dataset.state = shpAnalog.throttle > 0.04
      ? 'throttle'
      : shpAnalog.brake > 0.78
        ? 'reverse'
        : shpAnalog.brake > 0.04
          ? 'brake'
          : 'neutral';
    gate.setAttribute('aria-valuenow', String(Math.round((shpAnalog.throttle - shpAnalog.brake) * 100)));
  }
};

shpRenderPrecisionControls();
