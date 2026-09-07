export type Vec2 = { x: number; z: number };

export type WaveComponent = {
  direction: number;
  amplitude: number;
  wavelength: number;
  speed: number;
  steepness: number;
};

export type WaveSample = {
  height: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  velocityX: number;
  velocityZ: number;
};

export type WindState = {
  direction: number;
  speed: number;
  gust: number;
};

export type ShipControls = {
  steer: number;
  sail: number;
  rowing: number;
};

export type ShipState = {
  x: number;
  z: number;
  worldX: number;
  worldZ: number;
  y: number;
  velocityX: number;
  velocityZ: number;
  verticalVelocity: number;
  yaw: number;
  yawVelocity: number;
  pitch: number;
  pitchVelocity: number;
  roll: number;
  rollVelocity: number;
  rudder: number;
  sailAngle: number;
  rowingPhase: number;
  distance: number;
};

export type ShipTelemetry = {
  speed: number;
  forwardSpeed: number;
  lateralSpeed: number;
  windAngle: number;
  apparentWindSpeed: number;
  sailEfficiency: number;
  heel: number;
};

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// Six harmonics give the water a broad swell, intermediate chop and short ripples.
// The same exact components are compiled into the ocean shader in world.ts.
export const WAVE_COMPONENTS: readonly WaveComponent[] = [
  { direction: 16 * DEG, amplitude: 0.56, wavelength: 24.0, speed: 5.65, steepness: 0.78 },
  { direction: 47 * DEG, amplitude: 0.34, wavelength: 13.2, speed: 4.62, steepness: 0.74 },
  { direction: -31 * DEG, amplitude: 0.21, wavelength: 7.2, speed: 3.48, steepness: 0.66 },
  { direction: 103 * DEG, amplitude: 0.125, wavelength: 3.85, speed: 2.42, steepness: 0.52 },
  { direction: -76 * DEG, amplitude: 0.068, wavelength: 1.92, speed: 1.66, steepness: 0.36 },
  { direction: 152 * DEG, amplitude: 0.036, wavelength: 0.94, speed: 1.08, steepness: 0.24 }
] as const;

// Wider sampling near bow/stern and amidships makes roll/pitch response much more boat-like.
export const BUOYANCY_POINTS = [
  { x: -0.92, z: 3.75 }, { x: 0.92, z: 3.75 },
  { x: -1.36, z: 2.15 }, { x: 1.36, z: 2.15 },
  { x: -1.52, z: 0.25 }, { x: 1.52, z: 0.25 },
  { x: -1.44, z: -1.75 }, { x: 1.44, z: -1.75 },
  { x: -1.04, z: -3.55 }, { x: 1.04, z: -3.55 }
] as const;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothTo(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt)));
}

export function wrapAngle(angle: number): number {
  let value = angle % TAU;
  if (value > Math.PI) value -= TAU;
  if (value < -Math.PI) value += TAU;
  return value;
}

export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

export function hash2(x: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function waveHeightAt(x: number, z: number, time: number, scale = 1): number {
  let height = 0;
  for (const wave of WAVE_COMPONENTS) {
    const k = TAU / wave.wavelength;
    const dx = Math.sin(wave.direction);
    const dz = Math.cos(wave.direction);
    const phase = k * (x * dx + z * dz) - wave.speed * k * time;
    height += Math.sin(phase) * wave.amplitude * scale;
  }
  return height;
}

export function sampleWave(x: number, z: number, time: number, scale = 1): WaveSample {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  let flowX = 0;
  let flowZ = 0;

  for (const wave of WAVE_COMPONENTS) {
    const k = TAU / wave.wavelength;
    const dx = Math.sin(wave.direction);
    const dz = Math.cos(wave.direction);
    const phase = k * (x * dx + z * dz) - wave.speed * k * time;
    const amplitude = wave.amplitude * scale;
    const cosPhase = Math.cos(phase);
    const sinPhase = Math.sin(phase);
    height += sinPhase * amplitude;
    const slope = cosPhase * amplitude * k;
    slopeX += slope * dx;
    slopeZ += slope * dz;
    const orbital = cosPhase * amplitude * wave.speed * wave.steepness;
    flowX += orbital * dx;
    flowZ += orbital * dz;
  }

  const nx = -slopeX;
  const ny = 1;
  const nz = -slopeZ;
  const invLength = 1 / Math.max(0.00001, Math.hypot(nx, ny, nz));
  return {
    height,
    normalX: nx * invLength,
    normalY: ny * invLength,
    normalZ: nz * invLength,
    velocityX: flowX,
    velocityZ: flowZ
  };
}

export function sailingPolar(relativeWindAngle: number): number {
  const degrees = Math.abs(wrapAngle(relativeWindAngle)) / DEG;
  if (degrees < 30) return 0.018;
  if (degrees < 39) return lerp(0.05, 0.43, (degrees - 30) / 9);
  if (degrees < 62) return lerp(0.43, 0.89, (degrees - 39) / 23);
  if (degrees < 105) return lerp(0.89, 1, (degrees - 62) / 43);
  if (degrees < 145) return lerp(1, 0.83, (degrees - 105) / 40);
  return lerp(0.83, 0.50, (degrees - 145) / 35);
}

export function idealSailTrim(relativeWindAngle: number): number {
  const degrees = Math.abs(wrapAngle(relativeWindAngle)) / DEG;
  return clamp((degrees - 24) / 148, 0.07, 1);
}

export function sailTrimEfficiency(trim: number, ideal: number): number {
  const miss = Math.abs(clamp(trim, 0, 1) - ideal);
  return Math.exp(-miss * miss * 10.6);
}

const MASS = 1680;
const YAW_INERTIA = 9650;
const PITCH_INERTIA = 11200;
const ROLL_INERTIA = 6400;
const BUOYANCY_STIFFNESS = 3450;
const BUOYANCY_DAMPING = 690;
const HULL_SAMPLE_Y = -0.52;
const MAX_RUDDER = 34 * DEG;
const WATER_COUPLING = 0.24;

function emptyTelemetry(): ShipTelemetry {
  return {
    speed: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    windAngle: 0,
    apparentWindSpeed: 0,
    sailEfficiency: 0,
    heel: 0
  };
}

export class ShipDynamics {
  readonly state: ShipState = {
    x: 0,
    z: 0,
    worldX: 0,
    worldZ: 0,
    y: 0.08,
    velocityX: 0,
    velocityZ: 0,
    verticalVelocity: 0,
    yaw: 0,
    yawVelocity: 0,
    pitch: 0,
    pitchVelocity: 0,
    roll: 0,
    rollVelocity: 0,
    rudder: 0,
    sailAngle: 0.42,
    rowingPhase: 0,
    distance: 0
  };

  private originX = 0;
  private originZ = 0;
  private lastTelemetry: ShipTelemetry = emptyTelemetry();

  get telemetry(): ShipTelemetry {
    return this.lastTelemetry;
  }

  reset(): void {
    Object.assign(this.state, {
      x: 0,
      z: 0,
      worldX: 0,
      worldZ: 0,
      y: 0.08,
      velocityX: 0,
      velocityZ: 0,
      verticalVelocity: 0,
      yaw: 0,
      yawVelocity: 0,
      pitch: 0,
      pitchVelocity: 0,
      roll: 0,
      rollVelocity: 0,
      rudder: 0,
      sailAngle: 0.42,
      rowingPhase: 0,
      distance: 0
    });
    this.originX = 0;
    this.originZ = 0;
    this.lastTelemetry = emptyTelemetry();
  }

  update(dt: number, time: number, controls: ShipControls, wind: WindState, waveScale: number): ShipTelemetry {
    const state = this.state;
    const safeDt = clamp(dt, 0.001, 1 / 30);
    const sinYaw = Math.sin(state.yaw);
    const cosYaw = Math.cos(state.yaw);
    const forwardX = sinYaw;
    const forwardZ = cosYaw;
    const rightX = cosYaw;
    const rightZ = -sinYaw;

    const centerWave = sampleWave(state.worldX, state.worldZ, time, waveScale);
    const waterRelX = state.velocityX - centerWave.velocityX * WATER_COUPLING;
    const waterRelZ = state.velocityZ - centerWave.velocityZ * WATER_COUPLING;
    const forwardSpeed = waterRelX * forwardX + waterRelZ * forwardZ;
    const lateralSpeed = waterRelX * rightX + waterRelZ * rightZ;

    const windX = Math.sin(wind.direction) * wind.speed;
    const windZ = Math.cos(wind.direction) * wind.speed;
    const apparentX = windX - state.velocityX;
    const apparentZ = windZ - state.velocityZ;
    const apparentWindSpeed = Math.hypot(apparentX, apparentZ);
    const apparentDirection = Math.atan2(apparentX, apparentZ);
    const relativeWindAngle = wrapAngle(apparentDirection - state.yaw);
    const idealTrim = idealSailTrim(relativeWindAngle);
    state.sailAngle = smoothTo(state.sailAngle, clamp(controls.sail, 0, 1), 3.9, safeDt);
    const polar = sailingPolar(relativeWindAngle);
    const trimEfficiency = sailTrimEfficiency(state.sailAngle, idealTrim);
    const sailEfficiency = polar * trimEfficiency;

    // A lift/drag split produces convincing heeling and leeway without an arcade speed impulse.
    const windPressure = apparentWindSpeed * apparentWindSpeed;
    const absWind = Math.abs(relativeWindAngle);
    const sideSign = Math.sign(Math.sin(relativeWindAngle)) || 1;
    const liftFactor = Math.sin(clamp(absWind, 0, Math.PI) * 2) * 0.5 + 0.5;
    const sailForce = windPressure * 10.8 * sailEfficiency * (0.86 + wind.gust * 0.16);
    const sailForwardForce = sailForce * (0.58 + polar * 0.38 + liftFactor * 0.12);
    const sailSideForce = sideSign * sailForce * (0.27 + liftFactor * 0.18);

    state.rowingPhase = (state.rowingPhase + safeDt * (2.0 + controls.rowing * 1.05)) % 1;
    const stroke = Math.max(0, Math.sin(state.rowingPhase * TAU));
    const rowingForce = clamp(controls.rowing, 0, 1)
      * (1180 + Math.max(0, 2.0 - Math.abs(forwardSpeed)) * 285)
      * (0.42 + stroke * 0.78);

    // Hull resistance rises sharply near hull speed. Keel resistance fights sideways drift.
    const forwardDrag = -forwardSpeed * (56 + Math.abs(forwardSpeed) * 84 + forwardSpeed * forwardSpeed * 6.4);
    const lateralDrag = -lateralSpeed * (290 + Math.abs(lateralSpeed) * 470 + Math.abs(forwardSpeed) * 92);
    const keelLift = -lateralSpeed * Math.abs(forwardSpeed) * 145;
    const totalForwardForce = sailForwardForce + rowingForce + forwardDrag;
    const totalLateralForce = sailSideForce + lateralDrag + keelLift;

    state.velocityX += (forwardX * totalForwardForce + rightX * totalLateralForce) / MASS * safeDt;
    state.velocityZ += (forwardZ * totalForwardForce + rightZ * totalLateralForce) / MASS * safeDt;

    const targetRudder = clamp(controls.steer, -1, 1) * MAX_RUDDER;
    const rudderRate = 58 * DEG;
    state.rudder += clamp(targetRudder - state.rudder, -rudderRate * safeDt, rudderRate * safeDt);
    const rudderFlow = clamp(Math.abs(forwardSpeed) / 4.2, 0, 1.8);
    const rudderEffect = Math.sin(state.rudder) * Math.cos(state.rudder * 0.55);
    const rudderTorque = -rudderEffect * forwardSpeed * Math.abs(forwardSpeed) * 1110;
    const sailYawTorque = -sailSideForce * 0.24;
    const yawDamping = -state.yawVelocity * (1450 + rudderFlow * 980 + Math.abs(lateralSpeed) * 330);
    state.yawVelocity += (rudderTorque + sailYawTorque + yawDamping) / YAW_INERTIA * safeDt;
    state.yawVelocity = clamp(state.yawVelocity, -0.88, 0.88);
    state.yaw = wrapAngle(state.yaw + state.yawVelocity * safeDt);

    let totalBuoyancy = 0;
    let pitchTorque = 0;
    let rollTorque = 0;
    let averageNormalX = 0;
    let averageNormalZ = 0;
    for (const point of BUOYANCY_POINTS) {
      const wx = state.worldX + point.x * cosYaw + point.z * sinYaw;
      const wz = state.worldZ - point.x * sinYaw + point.z * cosYaw;
      const water = sampleWave(wx, wz, time, waveScale);
      averageNormalX += water.normalX;
      averageNormalZ += water.normalZ;
      const localHullY = HULL_SAMPLE_Y + point.z * Math.sin(state.pitch) - point.x * Math.sin(state.roll);
      const pointVerticalVelocity = state.verticalVelocity + state.pitchVelocity * point.z - state.rollVelocity * point.x;
      const submersion = water.height - (state.y + localHullY);
      const force = Math.max(0, submersion * BUOYANCY_STIFFNESS - pointVerticalVelocity * BUOYANCY_DAMPING);
      totalBuoyancy += force;
      pitchTorque += force * point.z;
      rollTorque -= force * point.x;
    }

    const gravityForce = MASS * 9.81;
    state.verticalVelocity += (totalBuoyancy - gravityForce) / MASS * safeDt;
    state.verticalVelocity *= Math.exp(-0.52 * safeDt);
    state.y += state.verticalVelocity * safeDt;

    averageNormalX /= BUOYANCY_POINTS.length;
    averageNormalZ /= BUOYANCY_POINTS.length;
    const wavePitchTarget = clamp(-averageNormalZ * 0.55, -12 * DEG, 12 * DEG);
    const waveRollTarget = clamp(averageNormalX * 0.55, -14 * DEG, 14 * DEG);
    const pitchDamping = -state.pitchVelocity * 5350 - (state.pitch - wavePitchTarget) * 1650;
    const rollDamping = -state.rollVelocity * 4850 - (state.roll - waveRollTarget) * 1820;
    const windHeelTorque = -sailSideForce * 1.34;
    const turnHeelTorque = -state.yawVelocity * forwardSpeed * Math.abs(forwardSpeed) * 260;
    state.pitchVelocity += (pitchTorque + pitchDamping) / PITCH_INERTIA * safeDt;
    state.rollVelocity += (rollTorque + rollDamping + windHeelTorque + turnHeelTorque) / ROLL_INERTIA * safeDt;
    state.pitchVelocity = clamp(state.pitchVelocity, -0.96, 0.96);
    state.rollVelocity = clamp(state.rollVelocity, -1.08, 1.08);
    state.pitch = clamp(state.pitch + state.pitchVelocity * safeDt, -24 * DEG, 24 * DEG);
    state.roll = clamp(state.roll + state.rollVelocity * safeDt, -31 * DEG, 31 * DEG);

    const beforeX = state.x;
    const beforeZ = state.z;
    state.x += state.velocityX * safeDt;
    state.z += state.velocityZ * safeDt;
    state.worldX = this.originX + state.x;
    state.worldZ = this.originZ + state.z;
    state.distance += Math.hypot(state.x - beforeX, state.z - beforeZ);

    if (Math.abs(state.x) > 1800 || Math.abs(state.z) > 1800) {
      this.originX += state.x;
      this.originZ += state.z;
      state.x = 0;
      state.z = 0;
      state.worldX = this.originX;
      state.worldZ = this.originZ;
    }

    const speed = Math.hypot(state.velocityX, state.velocityZ);
    this.lastTelemetry = {
      speed,
      forwardSpeed,
      lateralSpeed,
      windAngle: relativeWindAngle,
      apparentWindSpeed,
      sailEfficiency,
      heel: state.roll
    };
    return this.lastTelemetry;
  }
}
