import { clamp, damp } from './core.js';
import { downhillDirection } from './terrain.js';
import { movementResponse, snowSample, snowSurfaceHeight } from './snow.js';

const REBASE_DISTANCE = 420;

export class MountainWalkerController {
  constructor(onRebase = () => {}, sampleHeight = snowSurfaceHeight) {
    this.onRebase = onRebase;
    this.sampleHeight = sampleHeight;
    this.globalX = 8;
    this.globalZ = -12;
    this.worldOffsetX = 0;
    this.worldOffsetZ = 0;
    this.localPosition = { x: 8, y: this.sampleHeight(8, -12), z: -12 };
    this.yaw = 0.12;
    this.pitch = -0.18;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.stepDistance = 0;
    this.stepSide = -1;
    this.stepPhase = 0;
    this.lastSlope = 0;
    this.lastSnow = snowSample(this.globalX, this.globalZ);
    this.sliding = 0;
    this.braceAmount = 0;
    this.verticalBob = 0;
    this.roll = 0;
    this.bodySink = 0;
    this.climbing = 0;
    this.climbPulse = 0;
  }

  applyLook(delta) {
    this.yaw += delta.x;
    this.pitch = clamp(this.pitch + delta.y, -1.16, 1.04);
  }

  update(dt, input) {
    const current = snowSample(this.globalX, this.globalZ);
    const down = downhillDirection(this.globalX, this.globalZ);
    const forwardX = Math.sin(this.yaw), forwardZ = Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    let dirX = forwardX * input.y + rightX * input.x;
    let dirZ = forwardZ * input.y + rightZ * input.x;
    const dirLen = Math.hypot(dirX, dirZ);
    if (dirLen > 0.001) { dirX /= dirLen; dirZ /= dirLen; }

    const uphillDot = -(dirX * down.x + dirZ * down.z);
    const uphillIntent = Math.max(0, uphillDot) * input.magnitude;
    const slopeDeg = current.slope * 57.2958;
    const climbTarget = clamp((slopeDeg - 24) / 24, 0, 1) * uphillIntent;
    this.climbing = damp(this.climbing, climbTarget, 8, dt);

    const response = movementResponse(current, uphillDot, input.sprint);
    const climbPenalty = 1 - this.climbing * 0.58;
    const baseSpeed = 3.05;
    let intendedSpeed = baseSpeed * response * climbPenalty * input.magnitude;

    // Above roughly 52 degrees the character can no longer simply walk upward.
    // Forward input becomes a slow scramble while gravity keeps pulling downhill.
    const overhang = clamp((slopeDeg - 50) / 16, 0, 1) * uphillIntent;
    intendedSpeed *= 1 - overhang * 0.72;

    const targetVx = dirX * intendedSpeed;
    const targetVz = dirZ * intendedSpeed;
    const acceleration = current.powder > 0.55 ? 4.2 : 7.6;
    this.vx = damp(this.vx, targetVx, acceleration, dt);
    this.vz = damp(this.vz, targetVz, acceleration, dt);

    this.braceAmount = damp(this.braceAmount, input.bracing ? 1 : 0, 12, dt);
    const slideThreshold = 0.34 + current.traction * 0.18;
    const slideDrive = Math.max(0, current.slope - slideThreshold) * (9.2 + current.ice * 8.5) * (1 - current.traction * 0.55);
    const climbGravity = Math.max(0, overhang) * 5.8;
    const braceReduction = 1 - this.braceAmount * 0.84;
    const slideAccel = (slideDrive + climbGravity) * braceReduction;
    this.vx += down.x * slideAccel * dt;
    this.vz += down.z * slideAccel * dt;
    if (input.bracing) { this.vx *= 1 - dt * 2.8; this.vz *= 1 - dt * 2.8; }

    const prevX = this.globalX, prevZ = this.globalZ;
    this.globalX += this.vx * dt;
    this.globalZ += this.vz * dt;
    const traveled = Math.hypot(this.globalX - prevX, this.globalZ - prevZ);
    this.speed = Math.hypot(this.vx, this.vz);
    this.sliding = damp(this.sliding, clamp(slideAccel / 7.5, 0, 1), 7, dt);
    this.lastSlope = current.slope;
    this.lastSnow = current;

    const sinkTarget = current.sinkDepth * (0.78 + clamp(this.speed / 3.2, 0, 1) * 0.22);
    this.bodySink = damp(this.bodySink, sinkTarget, current.powder > 0.5 ? 5.5 : 10, dt);

    this.stepDistance += traveled;
    const stride = clamp(0.7 - this.speed * 0.04 + current.sink * 0.3 + this.climbing * 0.18, 0.48, 1.02);
    const landings = [];
    if (this.speed > 0.2 && this.stepDistance >= stride) {
      this.stepDistance -= stride;
      this.stepSide *= -1;
      const side = this.stepSide * 0.12;
      const fx = this.globalX + rightX * side + forwardX * 0.045;
      const fz = this.globalZ + rightZ * side + forwardZ * 0.045;
      const sample = snowSample(fx, fz);
      landings.push({
        globalX: fx, globalZ: fz,
        localX: fx - this.worldOffsetX, localZ: fz - this.worldOffsetZ,
        y: this.sampleHeight(fx, fz), yaw: this.yaw, side: this.stepSide,
        sink: sample.sink, sinkDepth: sample.sinkDepth, powder: sample.powder, hardness: sample.hardness,
        instability: sample.instability, slide: this.sliding, climbing: this.climbing
      });
    }

    this.stepPhase += traveled * (5.4 + current.sink * 1.7 + this.climbing * 1.1);
    this.climbPulse += dt * (3.8 + this.climbing * 3.6);
    const posthole = current.sink * clamp(this.speed / 2.8, 0, 1);
    const bobAmp = clamp(this.speed / 3.5, 0, 1) * (0.025 + posthole * 0.065 + this.climbing * 0.035);
    const climbLurch = Math.sin(this.climbPulse) * this.climbing * 0.045;
    this.verticalBob = Math.sin(this.stepPhase * 2) * bobAmp + climbLurch;
    this.roll = damp(this.roll, Math.sin(this.stepPhase) * clamp(this.speed / 4, 0, 1) * (0.018 + current.sink * 0.02) + this.sliding * 0.035 * Math.sign(this.vx || 1), 10, dt);

    this.localPosition.x = this.globalX - this.worldOffsetX;
    this.localPosition.z = this.globalZ - this.worldOffsetZ;
    this.localPosition.y = this.sampleHeight(this.globalX, this.globalZ);
    this.maybeRebase();

    return {
      snow: current,
      landings,
      sliding: this.sliding,
      climbing: this.climbing,
      braceNeeded: this.sliding > 0.08 || (current.slope > 0.5 && current.traction < 0.55)
    };
  }

  maybeRebase() {
    if (Math.abs(this.localPosition.x) < REBASE_DISTANCE && Math.abs(this.localPosition.z) < REBASE_DISTANCE) return;
    const dx = Math.trunc(this.localPosition.x / 140) * 140;
    const dz = Math.trunc(this.localPosition.z / 140) * 140;
    this.worldOffsetX += dx; this.worldOffsetZ += dz;
    this.localPosition.x -= dx; this.localPosition.z -= dz;
    this.onRebase(dx, dz, this.worldOffsetX, this.worldOffsetZ);
  }

  snapshot() {
    return { globalX: this.globalX, globalZ: this.globalZ, yaw: this.yaw, pitch: this.pitch, worldOffsetX: this.worldOffsetX, worldOffsetZ: this.worldOffsetZ };
  }

  restore(snapshot) {
    if (![snapshot.globalX, snapshot.globalZ, snapshot.yaw, snapshot.pitch].every(Number.isFinite)) return;
    this.globalX = snapshot.globalX; this.globalZ = snapshot.globalZ;
    this.yaw = snapshot.yaw; this.pitch = snapshot.pitch;
    this.worldOffsetX = Number.isFinite(snapshot.worldOffsetX) ? snapshot.worldOffsetX : 0;
    this.worldOffsetZ = Number.isFinite(snapshot.worldOffsetZ) ? snapshot.worldOffsetZ : 0;
    this.localPosition.x = this.globalX - this.worldOffsetX;
    this.localPosition.z = this.globalZ - this.worldOffsetZ;
    this.localPosition.y = this.sampleHeight(this.globalX, this.globalZ);
  }
}
