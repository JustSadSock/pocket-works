import { Vector3 } from '@babylonjs/core';
import { clamp, damp } from './core.js';

export const DEFAULT_SPAWN = Object.freeze({ x: 150, z: 40, yaw: 0.02, pitch: -0.055 });

export class SandWalkerController {
  constructor(onRebase, surface) {
    this.surface = surface;
    this.worldOffsetX = DEFAULT_SPAWN.x;
    this.worldOffsetZ = DEFAULT_SPAWN.z;
    const h0 = surface?.sampleHeight?.(this.worldOffsetX, this.worldOffsetZ) ?? 0;
    this.localPosition = new Vector3(0, h0, 0);
    this.velocity = new Vector3(0, 0, 0);
    this.yaw = DEFAULT_SPAWN.yaw;
    this.pitch = DEFAULT_SPAWN.pitch;
    this.bodyYaw = this.yaw;
    this.speed = 0;
    this.gait = 0;
    this.onRebase = onRebase;
    this.lastSlope = 0;
    this.sliding = 0;
    this.sandSink = 0;
    this.softness = 0.48;
  }

  get globalX() { return this.localPosition.x + this.worldOffsetX; }
  get globalZ() { return this.localPosition.z + this.worldOffsetZ; }
  get groundY() { return this.localPosition.y; }
  sampleHeight(x, z) { return this.surface?.sampleHeight?.(x, z) ?? 0; }
  sampleNormal(x, z) { return this.surface?.sampleNormal?.(x, z) ?? { x: 0, y: 1, z: 0 }; }

  applyLook(look) {
    this.yaw -= look.x;
    this.pitch = clamp(this.pitch - look.y, -1.34, 1.18);
  }

  restore(snapshot) {
    if (!snapshot || !Number.isFinite(snapshot.x) || !Number.isFinite(snapshot.z)) return false;
    this.worldOffsetX = snapshot.x;
    this.worldOffsetZ = snapshot.z;
    this.localPosition.set(0, this.sampleHeight(snapshot.x, snapshot.z), 0);
    this.velocity.setAll(0);
    this.yaw = Number.isFinite(snapshot.yaw) ? snapshot.yaw : this.yaw;
    this.pitch = Number.isFinite(snapshot.pitch) ? clamp(snapshot.pitch, -1.34, 1.18) : this.pitch;
    this.bodyYaw = this.yaw;
    this.speed = 0;
    this.sliding = 0;
    this.sandSink = 0;
    this.softness = 0.48;
    return true;
  }

  resetToSpawn() {
    this.worldOffsetX = DEFAULT_SPAWN.x;
    this.worldOffsetZ = DEFAULT_SPAWN.z;
    this.localPosition.set(0, this.sampleHeight(DEFAULT_SPAWN.x, DEFAULT_SPAWN.z), 0);
    this.velocity.setAll(0);
    this.yaw = DEFAULT_SPAWN.yaw;
    this.pitch = DEFAULT_SPAWN.pitch;
    this.bodyYaw = this.yaw;
    this.speed = 0;
    this.sliding = 0;
    this.sandSink = 0;
    this.softness = 0.48;
  }

  snapshot() { return { x: this.globalX, z: this.globalZ, yaw: this.yaw, pitch: this.pitch }; }

  update(dt, input) {
    dt = Math.min(dt, 0.034);
    const forwardX = Math.sin(this.yaw), forwardZ = Math.cos(this.yaw), rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    let wishX = forwardX * input.y + rightX * input.x, wishZ = forwardZ * input.y + rightZ * input.x;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 1e-4) { wishX /= wishLen; wishZ /= wishLen; }

    const gx = this.globalX, gz = this.globalZ, normal = this.sampleNormal(gx, gz);
    const slope = Math.acos(clamp(normal.y, -1, 1));
    this.lastSlope = slope;
    this.softness = this.surface?.sampleSoftness?.(gx, gz) ?? 0.48;
    const horizontalNormal = Math.max(0.001, Math.hypot(normal.x, normal.z));
    const uphill = wishLen > 0 ? clamp(-(wishX * normal.x + wishZ * normal.z) / horizontalNormal, -1, 1) : 0;
    const uphillPenalty = Math.max(0, uphill) * clamp(slope / 0.6, 0, 1);
    const downhillAssist = Math.max(0, -uphill) * clamp(slope / 0.65, 0, 1);

    const looseDrag = clamp((this.softness - 0.40) / 0.56, 0, 1);
    const firmAssist = clamp((0.44 - this.softness) / 0.28, 0, 1);
    const softGroundFactor = 0.96 - looseDrag * 0.13 - uphillPenalty * 0.07 + firmAssist * 0.025;
    const maxSpeed = (3.08 - uphillPenalty * 1.08 + downhillAssist * 0.34) * input.magnitude * softGroundFactor;
    const targetX = wishX * maxSpeed, targetZ = wishZ * maxSpeed;
    const acceleration = wishLen > 0
      ? (5.65 - uphillPenalty * 1.20 - looseDrag * 0.55)
      : (7.4 - looseDrag * 0.65);
    this.velocity.x = damp(this.velocity.x, targetX, acceleration, dt);
    this.velocity.z = damp(this.velocity.z, targetZ, acceleration, dt);

    this.sliding = clamp((slope - 0.45) / 0.24, 0, 1) * Math.max(0.1, input.magnitude) * (0.74 + looseDrag * 0.52);
    if (this.sliding > 0) {
      const down = this.surface?.downhill?.(gx, gz) ?? { x: normal.x / horizontalNormal, z: normal.z / horizontalNormal };
      const slideForce = this.sliding * (0.92 + looseDrag * 0.42);
      this.velocity.x += down.x * slideForce * dt;
      this.velocity.z += down.z * slideForce * dt;
    }

    this.localPosition.x += this.velocity.x * dt;
    this.localPosition.z += this.velocity.z * dt;
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    const speedNorm = clamp(this.speed / 3.0, 0, 1);
    const sinkTarget = wishLen > 0.05
      ? 0.006 + this.softness * 0.018 + speedNorm * (0.006 + this.softness * 0.010) + clamp(slope / 0.65, 0, 1) * 0.006
      : 0.002 + this.softness * 0.004;
    this.sandSink = damp(this.sandSink, sinkTarget, wishLen > 0.05 ? 6.2 : 3.7, dt);

    const nextGX = this.globalX, nextGZ = this.globalZ;
    const targetY = this.sampleHeight(nextGX, nextGZ) - this.sandSink;
    const verticalLambda = this.speed > 0.2 ? 25 : 18;
    this.localPosition.y = damp(this.localPosition.y, targetY, verticalLambda, dt);
    if (this.localPosition.y < targetY - 0.018) this.localPosition.y = targetY - 0.018;

    this.gait += this.speed * dt * (1.72 + firmAssist * 0.12 - looseDrag * 0.10);
    this.bodyYaw = dampAngle(this.bodyYaw, this.yaw, 6.4, dt);
    if (Math.abs(this.localPosition.x) > 320 || Math.abs(this.localPosition.z) > 320) this.rebase();
    return { normal, slope, uphillPenalty, sliding: this.sliding, softness: this.softness };
  }

  rebase() {
    const dx = this.localPosition.x, dz = this.localPosition.z;
    this.worldOffsetX += dx;
    this.worldOffsetZ += dz;
    this.localPosition.x = 0;
    this.localPosition.z = 0;
    this.onRebase?.(dx, dz, this.worldOffsetX, this.worldOffsetZ);
  }
}

function dampAngle(current, target, lambda, dt) {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}
