/** Mass-aware crow locomotion. Distances are metres, time is seconds, Y is up. */
export type V3 = { x: number; y: number; z: number };
export type Controls = { turn: number; pitch: number; flap: number; brake: number };
export type CrowState = {
  position: V3; velocity: V3; yaw: number; pitch: number; roll: number;
  speed: number; flapPhase: number; flap: number;
  mode: 'idle' | 'walk' | 'run' | 'takeoff' | 'flap' | 'glide' | 'dive' | 'brake' | 'land' | 'stunned';
  grounded: boolean; supportY: number; impact: number;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));
const magnitude = (v: V3) => Math.hypot(v.x, v.y, v.z);
const memory = new WeakMap<CrowState, { takeoff: number; stunned: number; landing: number }>();
function timers(s: CrowState) {
  let t = memory.get(s);
  if (!t) { t = { takeoff: 0, stunned: 0, landing: 0 }; memory.set(s, t); }
  return t;
}

export function createCrowState(pos: V3 = { x: 0, y: 8.46, z: 0 }): CrowState {
  return { position: { ...pos }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0,
    roll: 0, speed: 0, flapPhase: 0, flap: 0, mode: 'idle', grounded: true,
    supportY: pos.y - .46, impact: 0 };
}

/** A leg impulse precedes powered strokes; the caller decides whether the support exists. */
export function launchCrow(s: CrowState): void {
  if (!s.grounded || timers(s).stunned > 0) return;
  s.grounded = false;
  s.velocity = { x: Math.sin(s.yaw) * 5.7, y: 4.2, z: Math.cos(s.yaw) * 5.7 };
  s.position.y += .035;
  s.flap = .9; s.mode = 'takeoff';
  timers(s).takeoff = .8;
}

/** Finish a contact at the real foot surface and retain a short landing blend. */
export function landCrow(s: CrowState, supportY: number): void {
  if (!Number.isFinite(supportY)) return;
  s.grounded = true;
  s.supportY = supportY;
  s.position.y = supportY + .46;
  s.velocity.x *= .12; s.velocity.z *= .12; s.velocity.y = 0;
  s.speed = magnitude(s.velocity);
  s.mode = 'land';
  timers(s).landing = .42;
  timers(s).takeoff = 0;
}

/** Positive pitch climbs, negative pitch dives. Ground movement uses pitch as forward/back. */
export function stepCrow(s: CrowState, input: Controls, dt: number, wind: V3 = { x: 0, y: 0, z: 0 }): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const clean = (v: number, signed = false) => Number.isFinite(v) ? clamp(v, signed ? -1 : 0, 1) : 0;
  const c: Controls = { turn: clean(input.turn, true), pitch: clean(input.pitch, true), flap: clean(input.flap), brake: clean(input.brake) };
  // Fixed small integration steps keep collision impulses and aerodynamic forces frame-rate stable.
  const duration = Math.min(dt, .25), count = Math.ceil(duration * 120), h = duration / count;
  for (let i = 0; i < count; i++) integrate(s, c, h, wind);
}

function integrate(s: CrowState, c: Controls, dt: number, wind: V3) {
  const t = timers(s);
  t.takeoff = Math.max(0, t.takeoff - dt);
  t.stunned = Math.max(0, t.stunned - dt);
  t.landing = Math.max(0, t.landing - dt);
  s.impact = smooth(s.impact, 0, 3, dt);
  if (s.grounded) {
    if (c.flap > .15 && t.stunned <= 0) { launchCrow(s); return; }
    if (s.mode !== 'idle' && s.mode !== 'walk' && s.mode !== 'run' && s.mode !== 'land') t.landing = .4;
    s.yaw += (t.stunned > 0 ? 0 : c.turn) * 2.1 * dt;
    const walk = (t.stunned > 0 ? 0 : c.pitch) * (Math.abs(c.pitch) > .75 ? 2.3 : 1.1);
    s.velocity.x = smooth(s.velocity.x, Math.sin(s.yaw) * walk, 8, dt);
    s.velocity.z = smooth(s.velocity.z, Math.cos(s.yaw) * walk, 8, dt);
    s.velocity.y = 0;
    s.position.x += s.velocity.x * dt; s.position.z += s.velocity.z * dt;
    s.position.y = s.supportY + .46;
    s.speed = magnitude(s.velocity);
    s.pitch = smooth(s.pitch, 0, 10, dt); s.roll = smooth(s.roll, 0, 10, dt);
    s.flap = smooth(s.flap, 0, 10, dt);
    s.mode = t.landing > 0 ? 'land' : s.speed < .12 ? 'idle' : s.speed > 1.4 ? 'run' : 'walk';
    return;
  }

  const stunned = t.stunned > 0;
  const turn = stunned ? 0 : c.turn;
  const pitchInput = stunned ? 0 : c.pitch;
  const brake = stunned ? 0 : c.brake;
  const air = { x: s.velocity.x - wind.x, y: s.velocity.y - wind.y, z: s.velocity.z - wind.z };
  const airSpeed = Math.max(.1, magnitude(air));
  const horizontal = Math.max(.1, Math.hypot(air.x, air.z));
  // A few automatic strokes prevent an accidental stall; they never create altitude in a glide.
  const assist = clamp((5.7 - airSpeed) / 3, 0, .65) * (1 - brake);
  const flapTarget = stunned ? .05 : Math.max(c.flap, assist, t.takeoff > 0 ? .9 : 0);
  s.flap = smooth(s.flap, flapTarget, 7, dt);
  s.flapPhase = (s.flapPhase + dt * (2.8 + 1.1 * s.flap) * Math.PI * 2) % (Math.PI * 2);
  s.roll = smooth(s.roll, stunned ? Math.sin(t.stunned * 12) * s.impact * .12 : -turn * .78 * clamp(airSpeed / 7, .25, 1), 4, dt);
  s.yaw += turn * (1.65 - clamp(airSpeed / 22, 0, .65)) * dt;
  const flightAngle = Math.atan2(s.velocity.y, horizontal);
  s.pitch = smooth(s.pitch, stunned ? -.35 : clamp(pitchInput * .72 + flightAngle * .3, -1, .85), 4.5, dt);

  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  // Lift acts normal to the relative wind, so gravity turns a dive into real speed.
  const ux = air.x / horizontal, uz = air.z / horizontal;
  const normalY = horizontal / airSpeed, normalHorizontal = -air.y / airSpeed;
  const wingLift = stunned ? 1.4 : clamp(airSpeed * airSpeed * .078, 0, 10.3);
  const lift = (wingLift + s.flap * 4.4 + pitchInput * 6.8 + brake * 2.5) * (1 - Math.abs(s.roll) * .13);
  const drag = (.035 + brake * .15 + Math.max(0, pitchInput) * .008 + (stunned ? .045 : 0)) * airSpeed;
  const thrust = s.flap * 6.3 * (1 - brake * .8);
  // Horizontal steering is a force, not a rewritten velocity; banked turns retain momentum.
  const steer = stunned ? .1 : 1.35 + brake * .5;
  const desiredX = fx * horizontal, desiredZ = fz * horizontal;
  const ax = ux * normalHorizontal * lift + fx * Math.cos(s.pitch) * thrust - air.x * drag + clamp((desiredX - air.x) * steer, -8, 8);
  const az = uz * normalHorizontal * lift + fz * Math.cos(s.pitch) * thrust - air.z * drag + clamp((desiredZ - air.z) * steer, -8, 8);
  const ay = -9.81 + normalY * lift + Math.sin(s.pitch) * thrust - air.y * drag;
  s.velocity.x += ax * dt; s.velocity.y += ay * dt; s.velocity.z += az * dt;
  // Safety only: ordinary flight settles naturally around 5–16 m/s.
  const speed = magnitude(s.velocity);
  if (speed > 27) { const f = 27 / speed; s.velocity.x *= f; s.velocity.y *= f; s.velocity.z *= f; }
  s.position.x += s.velocity.x * dt; s.position.y += s.velocity.y * dt; s.position.z += s.velocity.z * dt;
  s.speed = magnitude(s.velocity);
  s.mode = stunned ? 'stunned' : t.takeoff > 0 ? 'takeoff' : brake > .25 ? 'brake' : pitchInput < -.45 && s.velocity.y < -2 ? 'dive' : s.flap > .3 ? 'flap' : 'glide';
}

/** Surface normal points away from the obstacle. Mild glances slide; hard impacts disorient. */
export function hitCrow(s: CrowState, normal: V3, intensity: number): void {
  const length = magnitude(normal);
  if (!Number.isFinite(length) || length < .001 || !Number.isFinite(intensity)) return;
  const n = { x: normal.x / length, y: normal.y / length, z: normal.z / length };
  const approach = s.velocity.x * n.x + s.velocity.y * n.y + s.velocity.z * n.z;
  if (approach >= 0) return;
  const severity = clamp(Math.max(intensity, -approach), 0, 20);
  const bounce = severity > 6 ? .28 : .05;
  s.velocity.x -= n.x * approach * (1 + bounce);
  s.velocity.y -= n.y * approach * (1 + bounce);
  s.velocity.z -= n.z * approach * (1 + bounce);
  s.impact = Math.max(s.impact, severity);
  if (severity > 6) {
    timers(s).stunned = clamp(.25 + severity * .045, .45, 1.1);
    s.mode = 'stunned'; s.flap *= .3;
  }
  s.speed = magnitude(s.velocity);
}
