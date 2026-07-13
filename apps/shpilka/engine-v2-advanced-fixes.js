// Runtime-safe CSS variable bridge for the analog controls.
const shpFixStyles = document.createElement('link');
shpFixStyles.rel = 'stylesheet';
shpFixStyles.href = './advanced-fixes.css?v=2.2.0';
document.head.append(shpFixStyles);

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

gearForSpeed = function shpGearForSignedSpeed(speed) {
  if (speed < -8) return 'R';
  if (speed < 18) return 'N';
  return String(Math.min(6, 1 + Math.floor(speed / 118)));
};

updateHud = function shpUpdateHudSigned() {
  if (!player) return;
  const signedSpeed = player.forwardSpeed || 0;
  speedValue.textContent = String(Math.round(Math.abs(signedSpeed) * 0.56));
  gearValue.textContent = gearForSpeed(signedSpeed);
  positionValue.textContent = `${raceOrder.indexOf(player) + 1}/${cars.length}`;
  lapValue.textContent = `${Math.min(player.completedLaps + 1, lapsToWin)}/${lapsToWin}`;
  lapTime.textContent = formatTime(Math.max(0, raceElapsed - player.lapStartTime));
  const record = currentRouteRecord();
  bestLap.textContent = record?.bestLap ? `РЕКОРД ${formatTime(record.bestLap)}` : 'РЕКОРД —';
};

shpRenderPrecisionControls();
