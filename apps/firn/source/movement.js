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
    this.yaw = 0.45;
    this.pitch = -0.08;
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
    const response = movementResponse(current, uphillDot, input.sprint);
    const baseSpeed = 3.0;
    const intendedSpeed = baseSpeed * response * input.magnitude;
    const targetVx = dirX * intendedSpeed;
    const targetVz = dirZ * intendedSpeed;
    const acceleration = current.powder > 0.55 ? 5.4 : 8.5;
    this.vx = damp(this.vx, targetVx, acceleration, dt);
    this.vz = damp(this.vz, targetVz, acceleration, dt);

    this.braceAmount = damp(this.braceAmount, input.bracing ? 1 : 0, 12, dt);
    const slideThreshold = 0.37 + current.traction * 0.16;
    const slideDrive = Math.max(0, current.slope - slideThreshold) * (8.2 + current.ice * 7.5) * (1 - current.traction * 0.52);
    const braceReduction = 1 - this.braceAmount * 0.82;
    const slideAccel = slideDrive * braceReduction;
    this.vx += down.x * slideAccel * dt;
    this.vz += down.z * slideAccel * dt;
    if (input.bracing) { this.vx *= 1 - dt * 2.6; this.vz *= 1 - dt * 2.6; }

    const prevX = this.globalX, prevZ = this.globalZ;
    this.globalX += this.vx * dt;
    this.globalZ += this.vz * dt;
    const traveled = Math.hypot(this.globalX - prevX, this.globalZ - prevZ);
    this.speed = Math.hypot(this.vx, this.vz);
    this.sliding = damp(this.sliding, clamp(slideAccel / 7.5, 0, 1), 7, dt);
    this.lastSlope = current.slope;
    this.lastSnow = current;

    this.stepDistance += traveled;
    const stride = clamp(0.72 - this.speed * 0.045 + current.sink * 0.22, 0.46, 0.84);
    const landings = [];
    if (this.speed > 0.28 && this.stepDistance >= stride) {
      this.stepDistance -= stride;
      this.stepSide *= -1;
      const side = this.stepSide * 0.115;
      const fx = this.globalX + rightX * side + forwardX * 0.05;
      const fz = this.globalZ + rightZ * side + forwardZ * 0.05;
      const sample = snowSample(fx, fz);
      landings.push({
        globalX: fx, globalZ: fz,
        localX: fx - this.worldOffsetX, localZ: fz - this.worldOffsetZ,
        y: this.sampleHeight(fx, fz), yaw: this.yaw, side: this.stepSide,
        sink: sample.sink, powder: sample.powder, hardness: sample.hardness,
        instability: sample.instability, slide: this.sliding
      });
    }

    this.stepPhase += traveled * (5.8 + current.sink * 1.2);
    const bobAmp = clamp(this.speed / 3.5, 0, 1) * (0.018 + current.sink * 0.035);
    this.verticalBob = Math.sin(this.stepPhase * 2) * bobAmp;
    this.roll = damp(this.roll, Math.sin(this.stepPhase) * clamp(this.speed / 4, 0, 1) * 0.018 + this.sliding * 0.022 * Math.sign(this.vx || 1), 10, dt);

    this.localPosition.x = this.globalX - this.worldOffsetX;
    this.localPosition.z = this.globalZ - this.worldOffsetZ;
    this.localPosition.y = this.sampleHeight(this.globalX, this.globalZ);
    this.maybeRebase();

    return { snow: current, landings, sliding: this.sliding, braceNeeded: this.sliding > 0.08 || (current.slope > 0.5 && current.traction < 0.55) };
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
