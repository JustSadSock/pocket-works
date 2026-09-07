import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { ShipControls, ShipState, ShipTelemetry, WindState } from './core';
import { ShipDynamics, clamp, sampleWave, smoothTo } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

const OAR_STATIONS = [-2.55, -1.28, -0.01, 1.26] as const;
const OAR_PORT_Y = 0.48;
const OAR_OUTBOARD_REACH = 2.14;
const dynamicsPhase = new WeakMap<ShipDynamics, number>();
const visualDeploy = new WeakMap<OceanWorld, number>();

type Stroke = { power: number; recovery: number };

function strokeAt(phase: number): Stroke {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.58) return { power: Math.max(0, Math.sin((p / 0.58) * Math.PI)), recovery: 0 };
  return { power: 0, recovery: Math.sin(((p - 0.58) / 0.42) * Math.PI) };
}

function dipAngle(power: number, recovery: number): number {
  return 0.12 + power * 0.55 - recovery * 0.06;
}

function contactFactor(state: ShipState, phase: number, time: number, waveScale: number): number {
  const { power } = strokeAt(phase);
  if (power <= 0.04) return 0;
  const bladeLocalY = OAR_PORT_Y - Math.sin(dipAngle(power, 0)) * OAR_OUTBOARD_REACH;
  const bladeWorldY = state.y + bladeLocalY;
  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  let wet = 0;
  let count = 0;

  for (const side of [-1, 1]) {
    for (const stationZ of OAR_STATIONS) {
      const localX = side * 3.48;
      const wx = state.worldX + localX * cosYaw + stationZ * sinYaw;
      const wz = state.worldZ - localX * sinYaw + stationZ * cosYaw;
      const water = sampleWave(wx, wz, time, waveScale);
      const immersion = water.height - bladeWorldY;
      if (immersion > -0.05) wet += clamp((immersion + 0.05) / 0.24, 0, 1);
      count += 1;
    }
  }
  return count ? wet / count : 0;
}

// Own the final rowing force. The underlying marine refit receives rowing=0, so there is
// exactly one stroke clock and exactly one water-contact-gated source of propulsive force.
const previousReset = ShipDynamics.prototype.reset;
ShipDynamics.prototype.reset = function tunedRowReset(): void {
  dynamicsPhase.delete(this);
  previousReset.call(this);
};

const previousDynamicsUpdate = ShipDynamics.prototype.update;
ShipDynamics.prototype.update = function tunedRowUpdate(
  dt: number,
  time: number,
  controls: ShipControls,
  wind: WindState,
  waveScale: number
): ShipTelemetry {
  const active = clamp(controls.rowing, 0, 1);
  const safeDt = clamp(dt, 0.001, 1 / 30);
  let phase = dynamicsPhase.get(this) ?? this.state.rowingPhase;
  const telemetry = previousDynamicsUpdate.call(this, dt, time, { ...controls, rowing: 0 }, wind, waveScale);

  if (active > 0.025) phase = (phase + safeDt * (0.42 + active * 0.07)) % 1;
  dynamicsPhase.set(this, phase);
  this.state.rowingPhase = phase;

  if (active > 0.025) {
    const { power } = strokeAt(phase);
    const wet = contactFactor(this.state, phase, time, waveScale);
    const acceleration = active * power * wet * 0.54;
    this.state.velocityX += Math.sin(this.state.yaw) * acceleration * safeDt;
    this.state.velocityZ += Math.cos(this.state.yaw) * acceleration * safeDt;
  }
  return telemetry;
};

function tuneOars(
  world: OceanWorld,
  state: ShipState,
  environment: EnvironmentFrame,
  time: number,
  dt: number,
  originX: number,
  originZ: number,
  rowing: number
): void {
  const active = clamp(rowing, 0, 1);
  const oldDeploy = visualDeploy.get(world) ?? 0;
  const deploy = smoothTo(oldDeploy, active > 0.03 ? 1 : 0, active > 0.03 ? 2.15 : 1.7, dt);
  visualDeploy.set(world, deploy);
  const splash = world.scene.particleSystems.find((system: { name: string }) => system.name === 'oar-splash');

  for (const side of [-1, 1]) {
    for (let index = 0; index < OAR_STATIONS.length; index += 1) {
      const pivot = world.scene.getTransformNodeByName(`physical-oar-${side}-${index}`);
      const shaft = world.scene.getMeshByName(`physical-oar-shaft-${side}-${index}`);
      const blade = world.scene.getMeshByName(`physical-oar-blade-${side}-${index}`);
      if (!pivot || !shaft || !blade) continue;

      const phase = ((state.rowingPhase + index * 0.01) % 1 + 1) % 1;
      const { power, recovery } = strokeAt(phase);
      const strokePower = power * active;
      const sweep = (phase < 0.58 ? (phase / 0.58 - 0.5) : (0.5 - (phase - 0.58) / 0.42)) * 0.68;
      const dip = dipAngle(strokePower, recovery) * deploy;

      pivot.position.set(side * (0.18 + deploy * 1.22), OAR_PORT_Y, OAR_STATIONS[index]);
      pivot.rotation.x = 0;
      pivot.rotation.y = side * sweep * deploy;
      pivot.rotation.z = -side * dip;

      shaft.position.x = side * (0.06 + deploy * 0.56);
      shaft.position.y = 0;
      shaft.scaling.y = 0.42 + deploy * 0.58;

      blade.position.x = side * (0.72 + deploy * 1.42);
      blade.position.y = 0;
      blade.scaling.x = 0.70 + deploy * 0.30;
      blade.rotation.x = recovery * 1.30 * deploy;

      if (deploy > 0.78 && strokePower > 0.25 && splash) {
        const p = blade.getAbsolutePosition();
        const water = sampleWave(p.x + originX, p.z + originZ, time, environment.waveScale);
        const immersion = water.height - p.y;
        if (immersion > -0.06 && immersion < 0.42) {
          if (splash.emitter instanceof Vector3) splash.emitter.set(p.x, water.height + 0.012, p.z);
          splash.manualEmitCount = Math.max(splash.manualEmitCount, 1 + Math.round(strokePower * 3));
        }
      }
    }
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosMarineTuningV1?: boolean };
if (!prototype.__pelagosMarineTuningV1) {
  prototype.__pelagosMarineTuningV1 = true;
  const previousWorldUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function tunedMarineUpdate(
    state: ShipState,
    telemetry: ShipTelemetry,
    environment: EnvironmentFrame,
    time: number,
    dt: number,
    originX: number,
    originZ: number,
    lookYaw: number,
    lookPitch: number,
    rowing: number
  ): void {
    previousWorldUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, 0);

    // A jib is sheeted separately from the mainsail. A small lateral angle keeps the forestay sail
    // visibly drawing instead of becoming an edge-on triangle from the portrait chase camera.
    const jib = this.scene.getMeshByName('physical-jib-sail');
    if (jib) {
      const side = Math.sign(Math.sin(telemetry.windAngle)) || 1;
      const target = side * (0.11 + state.sailAngle * 0.31);
      jib.rotation.y = smoothTo(jib.rotation.y, target, 2.0, dt);
    }

    tuneOars(this, state, environment, time, dt, originX, originZ, rowing);
  };
}
