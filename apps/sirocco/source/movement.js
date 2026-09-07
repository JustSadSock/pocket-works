import { Vector3 } from '@babylonjs/core';
import { clamp, damp } from './core.js';

export class SandWalkerController {
  constructor(onRebase, surface) {
    this.surface = surface;
    const h0 = surface?.sampleHeight?.(0, 0) ?? 0;
    this.localPosition = new Vector3(0, h0, 0);
    this.velocity = new Vector3(0, 0, 0);
    this.worldOffsetX = 0; this.worldOffsetZ = 0;
    this.yaw = 0.15; this.pitch = -0.08; this.bodyYaw = this.yaw;
    this.speed = 0; this.gait = 0; this.onRebase = onRebase; this.lastSlope = 0; this.sliding = 0;
    this.sandSink = 0;
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
    this.worldOffsetX = snapshot.x; this.worldOffsetZ = snapshot.z;
    this.localPosition.set(0, this.sampleHeight(snapshot.x, snapshot.z), 0);
    this.velocity.setAll(0);
    this.yaw = Number.isFinite(snapshot.yaw) ? snapshot.yaw : this.yaw;
    this.pitch = Number.isFinite(snapshot.pitch) ? clamp(snapshot.pitch, -1.34, 1.18) : this.pitch;
    this.bodyYaw = this.yaw; this.speed = 0; this.sliding = 0; this.sandSink = 0; return true;
  }

  snapshot() { return { x: this.globalX, z: this.globalZ, yaw: this.yaw, pitch: this.pitch }; }

  update(dt, input) {
    dt = Math.min(dt, 0.034);
    const forwardX = Math.sin(this.yaw), forwardZ = Math.cos(this.yaw), rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    let wishX = forwardX * input.y + rightX * input.x, wishZ = forwardZ * input.y + rightZ * input.x;
    const wishLen = Math.hypot(wishX, wishZ); if (wishLen > 1e-4) { wishX /= wishLen; wishZ /= wishLen; }

    const gx = this.globalX, gz = this.globalZ, normal = this.sampleNormal(gx, gz);
    const slope = Math.acos(clamp(normal.y, -1, 1)); this.lastSlope = slope;
    const horizontalNormal = Math.max(0.001, Math.hypot(normal.x, normal.z));
    const uphill = wishLen > 0 ? clamp(-(wishX * normal.x + wishZ * normal.z) / horizontalNormal, -1, 1) : 0;
    const uphillPenalty = Math.max(0, uphill) * clamp(slope / 0.6, 0, 1);
    const downhillAssist = Math.max(0, -uphill) * clamp(slope / 0.65, 0, 1);

    // Loose sand absorbs energy. It should still feel responsive on a phone, but
    // acceleration and top speed are deliberately lower than hard-ground FPS movement.
    const softGroundFactor = 0.90 - uphillPenalty * 0.08;
    const maxSpeed = (3.05 - uphillPenalty * 1.08 + downhillAssist * 0.34) * input.magnitude * softGroundFactor;
    const targetX = wishX * maxSpeed, targetZ = wishZ * maxSpeed;
    const acceleration = wishLen > 0 ? (5.45 - uphillPenalty * 1.25) : 7.2;
    this.velocity.x = damp(this.velocity.x, targetX, acceleration, dt);
    this.velocity.z = damp(this.velocity.z, targetZ, acceleration, dt);

    this.sliding = clamp((slope - 0.45) / 0.24, 0, 1) * Math.max(0.1, input.magnitude);
    if (this.sliding > 0) {
      const down = this.surface?.downhill?.(gx, gz) ?? { x: normal.x / horizontalNormal, z: normal.z / horizontalNormal };
      const slideForce = this.sliding * 1.08; this.velocity.x += down.x * slideForce * dt; this.velocity.z += down.z * slideForce * dt;
    }

    this.localPosition.x += this.velocity.x * dt; this.localPosition.z += this.velocity.z * dt;
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    const speedNorm = clamp(this.speed / 3.0, 0, 1);
    const sinkTarget = wishLen > 0.05
      ? 0.010 + speedNorm * 0.013 + clamp(slope / 0.65, 0, 1) * 0.008
      : 0.004;
    this.sandSink = damp(this.sandSink, sinkTarget, wishLen > 0.05 ? 5.8 : 3.4, dt);

    const nextGX = this.globalX, nextGZ = this.globalZ;
    const targetY = this.sampleHeight(nextGX, nextGZ) - this.sandSink;
    const verticalLambda = this.speed > 0.2 ? 24 : 18;
    this.localPosition.y = damp(this.localPosition.y, targetY, verticalLambda, dt);
    if (this.localPosition.y < targetY - 0.02) this.localPosition.y = targetY - 0.02;

    this.gait += this.speed * dt * 1.82;
    this.bodyYaw = dampAngle(this.bodyYaw, this.yaw, 6.4, dt);
    if (Math.abs(this.localPosition.x) > 320 || Math.abs(this.localPosition.z) > 320) this.rebase();
    return { normal, slope, uphillPenalty, sliding: this.sliding };
  }

  rebase() {
    const dx = this.localPosition.x, dz = this.localPosition.z;
    this.worldOffsetX += dx; this.worldOffsetZ += dz; this.localPosition.x = 0; this.localPosition.z = 0;
    this.onRebase?.(dx, dz, this.worldOffsetX, this.worldOffsetZ);
  }
}

function dampAngle(current, target, lambda, dt) {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}
