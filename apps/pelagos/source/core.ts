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

export const WAVE_COMPONENTS: readonly WaveComponent[] = [
  { direction: 18 * DEG, amplitude: 0.54, wavelength: 22, speed: 5.4, steepness: 0.82 },
  { direction: 61 * DEG, amplitude: 0.31, wavelength: 11, speed: 4.2, steepness: 0.72 },
  { direction: -34 * DEG, amplitude: 0.19, wavelength: 6.3, speed: 3.1, steepness: 0.64 },
  { direction: 112 * DEG, amplitude: 0.10, wavelength: 3.2, speed: 2.15, steepness: 0.48 },
  { direction: -78 * DEG, amplitude: 0.055, wavelength: 1.55, speed: 1.45, steepness: 0.32 }
] as const;

export const BUOYANCY_POINTS = [
  { x: -1.25, z: 3.45 },
  { x: 1.25, z: 3.45 },
  { x: -1.45, z: 1.25 },
  { x: 1.45, z: 1.25 },
  { x: -1.5, z: -1.35 },
  { x: 1.5, z: -1.35 },
  { x: -1.16, z: -3.35 },
  { x: 1.16, z: -3.35 }
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
  h = Math.imul(h ^ (h >>> 13), 1274126177;
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
  const angle = Math.abs(wrapAngle(relativeWindAngle));
  const degrees = angle / DEG;
  if (degrees < 32) return 0.025;
  if (degrees < 42) return lerp(0.08, 0.52, (degrees - 32) / 10);
  if (degrees < 72) return lerp(0.52, 0.97, (degrees - 42) / 30);
  if (degrees < 118) return lerp(0.97, 1, (degrees - 72) / 46);
  if (degrees < 155) return lerp(1, 0.77, (degrees - 118) / 37);
  return lerp(0.77, 0.48, (degrees - 155) / 25);
}

export function idealSailTrim(relativeWindAngle: number): number {
  const degrees = Math.abs(wrapAngle(relativeWindAngle)) / DEG;
  return clamp((degrees - 25) / 145, 0.08, 1);
}

export function sailTrimEfficiency(trim: number, ideal: number): number {
  const miss = Math.abs(clamp(trim, 0, 1) - ideal);
  return Math.exp(-miss * miss * 9.5);
}

const MASS = 1450;
const YAW_INERTIA = 7800;
const PITCH_INERTIA = 9200;
const ROLL_INERTIA = 5200;
const BUOYANCY_STIFFNESS = 3650;
const BUOYANCY_DAMPING = 570;
const HULL_SAMPLE_Y = -0.46;
const MAX_RUDDER = 32 * DEG;

export class ShipDynamics {
  readonly state: ShipState = {
    x: 0,
    z: 0,
    worldX: 0,
    worldZ: 0,
    y: 0.06,
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
  private lastTelemetry: ShipTelemetry = {
    speed: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    windAngle: 0,
    apparentWindSpeed: 0,
    sailEfficiency: 0,
    heel: 0
  };

  get telemetry(): ShipTelemetry {
    return this.lastTelemetry;
  }

  reset(): void {
    Object.assign(this.state, {
      x: 0,
      z: 0,
      worldX: 0,
      worldZ: 0,
      y: 0.06,
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
    this.lastTelemetry = {
      speed: 0,
      forwardSpeed: 0,
      lateralSpeed: 0,
      windAngle: 0,
      apparentWindSpeed: 0,
      sailEfficiency: 0,
      heel: 0
    };
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
    const waterRelX = state.velocityX - centerWave.velocityX * 0.18;
    const waterRelZ = state.velocityZ - centerWave.velocityZ * 0.18;
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
    const requestedSailAngle = clamp(controls.sail, 0, 1);
    state.sailAngle = smoothTo(state.sailAngle, requestedSailAngle, 4.2, safeDt);
    const polar = sailingPolar(relativeWindAngle);
    const trimEfficiency = sailTrimEfficiency(state.sailAngle, idealTrim);
    const sailEfficiency = polar * trimEfficiency;

    const windPressure = apparentWindSpeed * apparentWindSpeed;
    const sailForce = windPressure * 10.2 * sailEfficiency * (0.82 + wind.gust * 0.18);
    const sideSign = Math.sign(Math.sin(relativeWindAngle)) || 1;
    const sailForwardForce = sailForce * (0.68 + 0.3 * Math.cos(relativeWindAngle - Math.PI / 2) ** 2);
    const sailSideForce = sideSign * sailForce * 0.37;

    state.rowingPhase = (state.rowingPhase + safeDt * (2.1 + controls.rowing * 0.9)) % 1;
    const stroke = Math.max(0, Math.sin(state.rowingPhase * TAU));
    const rowingForce = clamp(controls.rowing, 0, 1) * (1050 + Math.max(0, 1.8 - Math.abs(forwardSpeed)) * 260) * (0.48 + stroke * 0.7);

    const forwardDrag = -forwardSpeed * Math.abs(forwardSpeed) * 72 - forwardSpeed * 48;
    const lateralDrag = -lateralSpeed * Math.abs(lateralSpeed) * 390 - lateralSpeed * 210;
    const totalForwardForce = sailForwardForce + rowingForce + forwardDrag;
    const totalLateralForce = sailSideForce + lateralDrag;

    const forceX = forwardX * totalForwardForce + rightX * totalLateralForce;
    const forceZ = forwardZ * totalForwardForce + rightZ * totalLateralForce;
    state.velocityX += (forceX / MASS) * safeDt;
    state.velocityZ += (forceZ / MASS) * safeDt;

    const targetRudder = clamp(controls.steer, -1, 1) * MAX_RUDDER;
    const rudderRate = 62 * DEG;
    const rudderDelta = clamp(targetRudder - state.rudder, -rudderRate * safeDt, rudderRate * safeDt);
    state.rudder += rudderDelta;
    const rudderFlow = clamp(Math.abs(forwardSpeed) / 4.5, 0, 1.65);
    const rudderTorque = -Math.sin(state.rudder) * forwardSpeed * Math.abs(forwardSpeed) * 940;
    const sailYawTorque = -sailSideForce * 0.22;
    const yawDamping = -state.yawVelocity * (1200 + rudderFlow * 850);
    state.yawVelocity += ((rudderTorque + sailYawTorque + yawDamping) / YAW_INERTIA) * safeDt;
    state.yaw = wrapAngle(state.yaw + state.yawVelocity * safeDt);

    let totalBuoyancy = 0;
    let pitchTorque = 0;
    let rollTorque = 0;
    for (const point of BUOYANCY_POINTS) {
      const wx = state.worldX + point.x * cosYaw + point.z * sinYaw;
      const wz = state.worldZ - point.x * sinYaw + point.z * cosYaw;
      const water = sampleWave(wx, wz, time, waveScale);
      const localHullY = HULL_SAMPLE_Y + point.z * Math.sin(state.pitch) - point.x * Math.sin(state.roll);
      const pointVerticalVelocity = state.verticalVelocity + state.pitchVelocity * point.z - state.rollVelocity * point.x;
      const submersion = water.height - (state.y + localHullY);
      const force = Math.max(0, submersion * BUOYANCY_STIFFNESS - pointVerticalVelocity * BUOYANCY_DAMPING);
      totalBuoyancy += force;
      pitchTorque += force * point.z;
      rollTorque -= force * point.x;
    }

    const gravityForce = MASS * 9.81;
    state.verticalVelocity += ((totalBuoyancy - gravityForce) / MASS) * safeDt;
    state.verticalVelocity *= Math.exp(-0.38 * safeDt);
    state.y += state.verticalVelocity * safeDt;

    const pitchDamping = -state.pitchVelocity * 4800 - state.pitch * 1100;
    const rollDamping = -state.rollVelocity * 4300 - state.roll * 1350;
    const windHeelTorque = -sailSideForce * 1.25;
    state.pitchVelocity += ((pitchTorque + pitchDamping) / PITCH_INERTIA) * safeDt;
    state.rollVelocity += ((rollTorque + rollDamping + windHeelTorque) / ROLL_INERTIA) * safeDt;
    state.pitchVelocity = clamp(state.pitchVelocity, -1.05, 1.05);
    state.rollVelocity = clamp(state.rollVelocity, -1.18, 1.18);
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
