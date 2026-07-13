// ШПИЛЬКА 2.3 — automatic steering ratio and touch calibration.

var shp23TouchNoise = 0.018;
var shp23SteerPointer = null;
var shp23LastRawSteer = 0;

shpPrefs.steeringFeel = 'precise';
shpSavePrefs();

function shp23AdaptiveSteer(raw) {
  const magnitude = Math.abs(raw);
  if (magnitude < 0.0001) return 0;
  const speedRatio = player ? clamp(Math.abs(player.forwardSpeed || 0) / MAX_SPEED, 0, 1) : 0;
  const slipRatio = player
    ? clamp((Math.abs(player.lateralSpeed || 0) + Math.abs(player.yawRate || 0) * 34) / 420, 0, 1)
    : 0;
  const ratio = clamp(
    1.08 - smoothstep(0.16, 0.96, speedRatio) * 0.42 - slipRatio * 0.10,
    0.54,
    1.08
  );
  const shaped = magnitude * ratio + Math.pow(magnitude, 3) * (1 - ratio);
  return Math.sign(raw) * clamp(shaped, 0, 1);
}

var shp23BasePlayerControls = playerControls;
playerControls = function shp23PlayerControls() {
  const commands = shp23BasePlayerControls();
  return { ...commands, steer: shp23AdaptiveSteer(commands.steer) };
};

function shp23BindAutomaticCalibration() {
  const arc = document.querySelector('#steeringArc');
  if (!arc) return;

  const calibrate = (event) => {
    if (event.pointerId !== shp23SteerPointer) return;
    const rect = arc.getBoundingClientRect();
    const raw = clamp((event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1, -1, 1);
    const delta = Math.abs(raw - shp23LastRawSteer);
    if (Math.abs(raw) < 0.17) {
      shp23TouchNoise = lerp(shp23TouchNoise, clamp(delta, 0.006, 0.055), 0.08);
    } else {
      shp23TouchNoise = lerp(shp23TouchNoise, 0.018, 0.018);
    }
    shp23LastRawSteer = raw;
    const deadZone = clamp(shp23TouchNoise * 1.8, 0.026, 0.065);
    const calibrated = Math.sign(raw) * clamp((Math.abs(raw) - deadZone) / (1 - deadZone), 0, 1);
    shpAnalog.steer = Math.sign(calibrated) * Math.pow(Math.abs(calibrated), 1.48);
    shpRenderPrecisionControls();
  };

  arc.addEventListener('pointerdown', (event) => {
    shp23SteerPointer = event.pointerId;
    shp23LastRawSteer = 0;
    calibrate(event);
  });
  arc.addEventListener('pointermove', calibrate);

  const release = (event) => {
    if (event.pointerId != null && event.pointerId !== shp23SteerPointer) return;
    shp23SteerPointer = null;
    shp23LastRawSteer = 0;
  };

  arc.addEventListener('pointerup', release);
  arc.addEventListener('pointercancel', release);
  arc.addEventListener('lostpointercapture', () => {
    shp23SteerPointer = null;
    shp23LastRawSteer = 0;
  });
}

shp23BindAutomaticCalibration();
