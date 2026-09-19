import { Vector3 } from '@babylonjs/core';
import type { VehicleSpec, VisualPreset } from './config';
import type { DriveInputState } from './input';
import type { CrashYard } from './arena';
import type { Vehicle } from './vehicle';

type TrafficAgent = {
  vehicle: Vehicle;
  waypoint: number;
  direction: 1 | -1;
};

function wrapAngle(angle: number) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export class TrafficSystem {
  readonly agents: TrafficAgent[] = [];

  constructor(private yard: CrashYard) {}

  add(vehicle: Vehicle, waypoint: number, direction: 1 | -1) {
    this.agents.push({ vehicle, waypoint, direction });
  }

  private inputFor(agent: TrafficAgent): DriveInputState {
    const waypoints = this.yard.trafficWaypoints;
    const target = waypoints[agent.waypoint];
    const pos = agent.vehicle.root.position;
    const delta = target.subtract(pos);
    if (delta.lengthSquared() < 18) {
      agent.waypoint = (agent.waypoint + agent.direction + waypoints.length) % waypoints.length;
    }

    const next = waypoints[agent.waypoint];
    const toTarget = next.subtract(pos);
    const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
    const forward = agent.vehicle.forward();
    const currentYaw = Math.atan2(forward.x, forward.z);
    const error = wrapAngle(desiredYaw - currentYaw);
    const steer = Math.max(-1, Math.min(1, error * 1.85));
    const throttle = Math.abs(error) > 1.1 ? 0.22 : Math.abs(error) > 0.58 ? 0.48 : 0.66;
    const brake = agent.vehicle.speedKmh() > 54 ? 0.36 : 0;
    return { steer, throttle, brake };
  }

  preStep(dt: number) {
    for (const agent of this.agents) {
      if (!agent.vehicle.effects().driveable) {
        agent.vehicle.preStep({ steer: 0, throttle: 0, brake: 1 }, dt);
        continue;
      }
      agent.vehicle.preStep(this.inputFor(agent), dt);
    }
  }

  sync() {
    for (const agent of this.agents) {
      agent.vehicle.syncVisual();
      agent.vehicle.syncDetached();
    }
  }

  dispose() {
    for (const agent of this.agents) agent.vehicle.dispose();
    this.agents.length = 0;
  }
}

export function trafficPreset(spec: VehicleSpec, index: number): VisualPreset {
  return spec.presets[index % spec.presets.length];
}

export const TRAFFIC_SPAWNS = [
  { position: new Vector3(-14, 1.05, 21), yaw: Math.PI / 2, waypoint: 1, direction: 1 as const },
  { position: new Vector3(15, 1.05, -15), yaw: Math.PI, waypoint: 4, direction: 1 as const },
  { position: new Vector3(-15, 1.05, -15), yaw: 0, waypoint: 0, direction: -1 as const }
];
