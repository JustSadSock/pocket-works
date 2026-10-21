import { Vector3 } from '@babylonjs/core';
import RAPIER from '@dimforge/rapier3d-compat';
import type { CollisionMeta, CollisionRegistry } from './physics-types';
import type { Vehicle, VehicleImpactResult } from './vehicle';
import { impactSpeeds, type BodyMotion } from './impact-kinematics';

export type CollisionFeedback = {
  vehicle: Vehicle;
  point: Vector3;
  normal: Vector3;
  result: VehicleImpactResult;
  material: 'concrete' | 'steel' | 'soft' | 'car';
  label: string;
  relativeSpeed: number;
  force: number;
};

function vector(value: { x: number; y: number; z: number }) {
  return new Vector3(value.x, value.y, value.z);
}

function motion(collider: RAPIER.Collider): BodyMotion {
  const body = collider.parent();
  if (!body) return { position: vector(collider.translation()), linear: Vector3.Zero(), angular: Vector3.Zero() };
  return { position: vector(body.translation()), linear: vector(body.linvel()), angular: vector(body.angvel()) };
}

/**
 * Rapier contact-force events are drained AFTER world.step. At that point
 * the solver has already removed much of the closing velocity, so measuring
 * collider.linvel() in drain() reports a 30 km/h wall strike as ~0 km/h.
 * Preserve the last pre-solver linear AND angular velocity at every collider.
 */
export class CollisionSystem {
  private beforeStep = new Map<number, BodyMotion>();
  private lastImpactAt = new Map<string, number>();
  private elapsed = 0;

  constructor(
    private world: RAPIER.World,
    private eventQueue: RAPIER.EventQueue,
    private registry: CollisionRegistry,
    private onImpact: (feedback: CollisionFeedback) => void
  ) {}

  captureBeforeStep() {
    this.beforeStep.clear();
    for (const handle of this.registry.keys()) {
      const collider = this.world.getCollider(handle);
      if (collider) this.beforeStep.set(handle, motion(collider));
    }
  }

  drain(dt: number) {
    this.elapsed += dt;
    this.eventQueue.drainContactForceEvents((event) => {
      const handle1 = event.collider1();
      const handle2 = event.collider2();
      const meta1 = this.registry.get(handle1);
      const meta2 = this.registry.get(handle2);
      if (!meta1?.vehicle && !meta2?.vehicle) return;
      const collider1 = this.world.getCollider(handle1);
      const collider2 = this.world.getCollider(handle2);
      if (!collider1 || !collider2) return;

      const contact = collider1.contactCollider(collider2, 0.14);
      const force = event.totalForceMagnitude();
      const fallbackNormal = vector(event.maxForceDirection());
      const p1 = contact ? vector(contact.point1) : vector(collider1.translation());
      const p2 = contact ? vector(contact.point2) : vector(collider2.translation());
      const normal1 = contact ? vector(contact.normal1) : fallbackNormal;
      const normal2 = contact ? vector(contact.normal2) : fallbackNormal.scale(-1);

      // Kinematics at each *contact point* account for spinning / pitched cars.
      const m1 = this.beforeStep.get(handle1) ?? motion(collider1);
      const m2 = this.beforeStep.get(handle2) ?? motion(collider2);
      const speeds = impactSpeeds(m1, m2, p1, p2, normal1);
      // Sideways tire rub, vibration and standing on the ground are not crashes.
      // The collision impulse must also be nontrivial; high static support force
      // at zero approach speed never produces damage.
      if (speeds.normalSpeed < 1.5 || force * dt < 65) return;

      // A force event fires every physics tick while bodies remain in contact.
      // A short pair cooldown turns one crumple into one impact, not 30 hits.
      const pair = handle1 < handle2 ? handle1 + ':' + handle2 : handle2 + ':' + handle1;
      if (this.elapsed - (this.lastImpactAt.get(pair) ?? -100) < 0.19) return;
      this.lastImpactAt.set(pair, this.elapsed);
      if (this.lastImpactAt.size > 300) {
        for (const [key, last] of this.lastImpactAt) {
          if (this.elapsed - last > 3) this.lastImpactAt.delete(key);
        }
      }

      if (meta1?.vehicle) this.applyForVehicle(meta1.vehicle, meta2, p1, normal1, force, speeds.normalSpeed, speeds.incidence, dt);
      if (meta2?.vehicle && meta2.vehicle !== meta1?.vehicle) {
        this.applyForVehicle(meta2.vehicle, meta1, p2, normal2, force, speeds.normalSpeed, speeds.incidence, dt);
      }
    });
  }

  private applyForVehicle(
    vehicle: Vehicle,
    other: CollisionMeta | undefined,
    point: Vector3,
    normal: Vector3,
    force: number,
    relativeSpeed: number,
    incidence: number,
    dt: number
  ) {
    const result = vehicle.applyCollision(point, normal, {
      force,
      dt,
      relativeSpeed,
      otherMass: other?.mass ?? Number.POSITIVE_INFINITY,
      obstacleStiffness: other?.stiffness ?? 1.35,
      contactArea: other?.contactArea ?? 0.7,
      angleCos: incidence
    });
    if (result.severity < 0.006) return;
    this.onImpact({
      vehicle,
      point,
      normal,
      result,
      material: other?.material ?? 'concrete',
      label: other?.label ?? 'contact',
      relativeSpeed,
      force
    });
  }
}
