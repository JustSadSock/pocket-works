export type Vec3 = { x: number; y: number; z: number };
export type FlightInput = { x: number; y: number; boost: number; brake: number };
export type FlightState = {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  roll: number;
  yawRate: number;
  pitchRate: number;
  rollRate: number;
  speed: number;
  verticalSpeed: number;
  lift: number;
  load: number;
  flap: number;
  flapPhase: number;
  mode: 'glide' | 'flap' | 'climb' | 'dive' | 'brake';
};

const MASS = 1280;
const GRAVITY = 9.81;
const WING_AREA = 86;
const AIR_DENSITY = 1.02;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const norm = (a: Vec3): Vec3 => { const l = Math.max(1e-5, length(a)); return mul(a, 1 / l); };
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

export function forwardFromAngles(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return norm({ x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp });
}

export function makeFlightState(): FlightState {
  return {
    position: { x: 0, y: 190, z: 0 },
    velocity: { x: 0, y: 0, z: 29 },
    yaw: 0,
    pitch: 0.02,
    roll: 0,
    yawRate: 0,
    pitchRate: 0,
    rollRate: 0,
    speed: 29,
    verticalSpeed: 0,
    lift: MASS * GRAVITY,
    load: 1,
    flap: 0.2,
    flapPhase: 0,
    mode: 'glide'
  };
}

export function stepFlight(s: FlightState, raw: FlightInput, dtRaw: number): FlightState {
  const dt = clamp(dtRaw, 1 / 240, 1 / 20);
  const input = {
    x: clamp(raw.x, -1, 1),
    y: clamp(raw.y, -1, 1),
    boost: clamp(raw.boost, 0, 1),
    brake: clamp(raw.brake, 0, 1)
  };
  const speed = Math.max(0.1, length(s.velocity));
  const speedN = clamp((speed - 14) / 50, 0, 1);
  const overSpeedPenalty = clamp(1 - Math.max(0, speed - 66) / 55, 0.32, 1);
  const controlAuthority = (0.3 + speedN * 0.9) * overSpeedPenalty;

  const rollTarget = -input.x * (0.32 + speedN * 0.72);
  const divingInput = input.y < -0.05;
  const climbingInput = input.y > 0.05;
  const pitchAuthority = divingInput
    ? 0.40 + 0.50 * controlAuthority
    : climbingInput
      ? 0.29 + 0.31 * controlAuthority
      : 0.18 + 0.18 * controlAuthority;
  const pitchTarget = input.y * pitchAuthority - clamp((speed - 78) / 100, 0, 0.12);
  const pitchResponse = divingInput ? 3.45 : climbingInput ? 3.0 : 2.35;
  const pitchDamping = divingInput ? 2.45 : climbingInput ? 2.55 : 2.8;
  s.rollRate += (rollTarget - s.roll) * (3.6 * controlAuthority) * dt - s.rollRate * 3.0 * dt;
  s.pitchRate += (pitchTarget - s.pitch) * (pitchResponse * controlAuthority) * dt - s.pitchRate * pitchDamping * dt;
  const bankTurn = -Math.sin(s.roll) * (0.34 + speed * 0.0105) * controlAuthority;
  s.yawRate += (bankTurn - s.yawRate) * 2.3 * dt;
  s.roll += s.rollRate * dt;
  s.pitch = clamp(s.pitch + s.pitchRate * dt, -1.02, 0.62);
  s.yaw += s.yawRate * dt;

  const forward = forwardFromAngles(s.yaw, s.pitch);
  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };
  let right = norm(cross(worldUp, forward));
  if (length(right) < 0.1) right = { x: 1, y: 0, z: 0 };
  const baseUp = norm(cross(forward, right));
  const wingUp = norm(add(mul(baseUp, Math.cos(s.roll)), mul(right, Math.sin(s.roll))));
  const velocityDir = norm(s.velocity);
  const aoa = clamp(s.pitch - Math.asin(clamp(velocityDir.y, -1, 1)), -0.42, 0.52);

  const flapNeed = clamp((27 - speed) / 16, 0, 1);
  const climbNeed = clamp(input.y, 0, 1) * 0.80;
  const flap = clamp(0.08 + flapNeed + climbNeed + input.boost * 1.1, 0, 1);
  const flapHz = lerp(0.75, 1.8, flap) * lerp(1.0, 0.75, speedN);
  s.flapPhase = (s.flapPhase + dt * flapHz * Math.PI * 2) % (Math.PI * 2);
  const downstroke = Math.max(0, Math.sin(s.flapPhase));
  const flapImpulse = flap * (0.45 + downstroke * 0.55);

  const diveFold = clamp(Math.max(-s.pitch - 0.04, -input.y * 0.60), 0, 0.90);
  const effectiveWingArea = WING_AREA * (1 - diveFold * 0.66);
  const stallFactor = clamp((speed - 10) / 17, 0, 1);
  const cl = clamp(0.34 + aoa * 1.75 + flapImpulse * 0.26, 0.06, 1.45) * stallFactor * (1 - diveFold * 0.40);
  const dynamicPressure = 0.5 * AIR_DENSITY * speed * speed;
  const liftMagnitude = dynamicPressure * effectiveWingArea * cl;
  // A tucked dragon is dramatically cleaner than one presenting two huge
  // membranes to the flow. Reducing both reference area and Cd lets potential
  // energy become speed during a committed dive instead of being burnt as drag.
  const streamlinedCd = 1 - diveFold * 0.68;
  const dragCoeff = (0.028 + aoa * aoa * 0.44 + input.brake * 0.50 + flapImpulse * 0.03) * streamlinedCd;
  const drag = dynamicPressure * effectiveWingArea * dragCoeff;
  const thrust = (8600 + input.boost * 13000) * flapImpulse + Math.max(0, 23 - speed) * 560;

  let force: Vec3 = { x: 0, y: -MASS * GRAVITY, z: 0 };
  force = add(force, mul(wingUp, liftMagnitude));
  force = add(force, mul(velocityDir, -drag));
  force = add(force, mul(forward, thrust));

  if (input.brake > 0.1) {
    force = add(force, mul(baseUp, dynamicPressure * 22 * input.brake));
  }

  const accel = mul(force, 1 / MASS);
  s.velocity = add(s.velocity, mul(accel, dt));
  const newSpeed = length(s.velocity);
  if (newSpeed > 96) s.velocity = mul(norm(s.velocity), 96);
  s.position = add(s.position, mul(s.velocity, dt));

  s.speed = length(s.velocity);
  s.verticalSpeed = s.velocity.y;
  s.lift = liftMagnitude;
  s.load = clamp(liftMagnitude / (MASS * GRAVITY), 0, 3.4);
  s.flap = lerp(s.flap, flap, 1 - Math.exp(-dt * 4.5));

  // Keep the semantic state aligned with the body's momentum after the finger
  // leaves the stick. This avoids a physically diving animal reporting GLIDE
  // merely because its pitch crossed a razor-thin threshold for one frame.
  const diving = (input.y < -0.45 && s.pitch < -0.10) || s.pitch < -0.17 || s.verticalSpeed < -6;
  const climbing = (input.y > 0.42 && s.pitch > 0.08) || (s.pitch > 0.12 && s.verticalSpeed > 2);
  s.mode = input.brake > 0.3 ? 'brake' : diving ? 'dive' : climbing ? 'climb' : s.flap > 0.48 ? 'flap' : 'glide';
  return s;
}

/**
 * Integrate one rendered frame using bounded aerodynamic substeps.
 *
 * Mobile Safari can occasionally deliver 80–120 ms frames while terrain or GPU
 * work spikes. Advancing the flight model only 40 ms in such a frame makes the
 * entire animal enter slow motion and destroys control consistency. We preserve
 * up to 120 ms of real elapsed time, split into <= 1/30 s steps, while keeping
 * rendering/world streaming at one update per frame.
 */
export function stepFlightFrame(s: FlightState, raw: FlightInput, frameDtRaw: number): FlightState {
  const frameDt = clamp(frameDtRaw, 1 / 240, 0.12);
  const steps = Math.max(1, Math.ceil(frameDt / (1 / 30)));
  const dt = frameDt / steps;
  for (let i = 0; i < steps; i++) stepFlight(s, raw, dt);
  return s;
}

export function terrainSafeAltitude(state: FlightState, terrainHeight: number, dt: number): void {
  const floor = terrainHeight + 8;
  if (state.position.y < floor) {
    state.position.y = floor;
    state.velocity.y = Math.max(5, state.velocity.y * -0.28);
    state.pitch = Math.max(state.pitch, 0.08);
    state.velocity.x *= Math.pow(0.7, dt * 4);
    state.velocity.z *= Math.pow(0.7, dt * 4);
  }
}
