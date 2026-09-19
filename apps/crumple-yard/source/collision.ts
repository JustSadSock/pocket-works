import { Vector3 } from '@babylonjs/core';
import RAPIER from '@dimforge/rapier3d-compat';
import type { CollisionMeta, CollisionRegistry } from './physics-types';
import type { Vehicle, VehicleImpactResult } from './vehicle';

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

function velocity(collider: RAPIER.Collider) {
  const body = collider.parent();
  if (!body) return Vector3.Zero();
  const v = body.linvel();
  return new Vector3(v.x, v.y, v.z);
}

function vector(value: { x: number; y: number; z: number }) {
  return new Vector3(value.x, value.y, value.z);
}

export class CollisionSystem {
  constructor(
    private world: RAPIER.World,
    private eventQueue: RAPIER.EventQueue,
    private registry: CollisionRegistry,
    private onImpact: (feedback: CollisionFeedback) => void
  ) {}

  drain(dt: number) {
    this.eventQueue.drainContactForceEvents((event) => {
      const handle1 = event.collider1();
      const handle2 = event.collider2();
      const meta1 = this.registry.get(handle1);
      const meta2 = this.registry.get(handle2);
      if (!meta1 && !meta2) return;
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
      const relative = velocity(collider1).subtract(velocity(collider2));
      const contactNormal = contact ? normal1 : fallbackNormal;
      const relativeLength = relative.length();
      const closingSpeed = Math.abs(Vector3.Dot(relative, contactNormal));
      const combinedSpeed = Math.max(closingSpeed, relativeLength * 0.42);
      const incidence = Math.max(0.18, Math.min(1, closingSpeed / Math.max(0.1, relativeLength)));

      if (meta1?.vehicle) {
        this.applyForVehicle(
          meta1.vehicle,
          meta2,
          p1,
          normal1,
          force,
          combinedSpeed,
          incidence,
          dt
        );
      }
      if (meta2?.vehicle && meta2.vehicle !== meta1?.vehicle) {
        this.applyForVehicle(
          meta2.vehicle,
          meta1,
          p2,
          normal2,
          force,
          combinedSpeed,
          incidence,
          dt
        );
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
    const meta = other;
    const result = vehicle.applyCollision(point, normal, {
      force,
      dt,
      relativeSpeed,
      otherMass: meta?.mass ?? Number.POSITIVE_INFINITY,
      obstacleStiffness: meta?.stiffness ?? 1.35,
      contactArea: meta?.contactArea ?? 0.7,
      angleCos: incidence
    });
    if (result.severity < 0.006) return;
    this.onImpact({
      vehicle,
      point,
      normal,
      result,
      material: meta?.material ?? 'concrete',
      label: meta?.label ?? 'contact',
      relativeSpeed,
      force
    });
  }
}
