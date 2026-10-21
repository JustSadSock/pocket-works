import { Vector3 } from '@babylonjs/core';

export type BodyMotion = { position: Vector3; linear: Vector3; angular: Vector3 };

/** v(point) = v(center of mass) + angular velocity crossed with contact offset. */
export function velocityAtPoint(body: BodyMotion, point: Vector3): Vector3 {
  return body.linear.add(Vector3.Cross(body.angular, point.subtract(body.position)));
}

/** Normal component of relative velocity immediately before the solver resolves contact. */
export function impactSpeeds(first: BodyMotion, second: BodyMotion, contact1: Vector3, contact2: Vector3, normal: Vector3) {
  const relative = velocityAtPoint(first, contact1).subtract(velocityAtPoint(second, contact2));
  const magnitude = relative.length();
  const direction = normal.lengthSquared() > 1e-7 ? normal.normalizeToNew() : Vector3.Zero();
  const normalSpeed = Math.abs(Vector3.Dot(relative, direction));
  return { normalSpeed, overallSpeed: magnitude, incidence: magnitude > 0.001 ? Math.min(1, normalSpeed / magnitude) : 0 };
}
