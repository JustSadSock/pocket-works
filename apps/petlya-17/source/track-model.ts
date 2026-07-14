import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { catmullRomClosed, clamp, lerp, wrap, type Vec3Tuple } from './core';

export type TrackSample = {
  position: Vector3;
  tangent: Vector3;
  right: Vector3;
  up: Vector3;
  distance: number;
  curvature: number;
  bank: number;
  u: number;
};

const CONTROL_POINTS: readonly Vec3Tuple[] = [
  [-155, 2, -58], [-104, 0, -143], [-12, 1, -178], [86, 3, -151],
  [164, 1, -87], [188, 6, 8], [151, 2, 101], [67, 0, 157],
  [-22, 5, 168], [-111, 1, 132], [-176, -1, 61], [-194, 4, -22]
];

function signedAngle(a: Vector3, b: Vector3): number {
  const cross = Vector3.Cross(a, b).y;
  const dot = clamp(Vector3.Dot(a, b), -1, 1);
  return Math.atan2(cross, dot);
}

export class TrackModel {
  readonly samples: TrackSample[] = [];
  readonly segments: number;
  length = 1;

  constructor(segments = 840) {
    this.segments = segments;
    this.rebuild();
  }

  private rawPoint(u: number): Vector3 {
    const [x, y, z] = catmullRomClosed(CONTROL_POINTS, u);
    return new Vector3(x, y, z);
  }

  private rebuild(): void {
    const positions: Vector3[] = [];
    const tangents: Vector3[] = [];
    const distances: number[] = [];
    let cumulative = 0;
    let previous = this.rawPoint(0);

    for (let index = 0; index <= this.segments; index += 1) {
      const u = index / this.segments;
      const position = this.rawPoint(u);
      if (index > 0) cumulative += Vector3.Distance(previous, position);
      const before = this.rawPoint(u - 1 / this.segments);
      const after = this.rawPoint(u + 1 / this.segments);
      positions.push(position);
      tangents.push(after.subtract(before).normalize());
      distances.push(cumulative);
      previous = position;
    }

    this.length = cumulative;
    this.samples.length = 0;
    for (let index = 0; index <= this.segments; index += 1) {
      const tangent = tangents[index];
      const previousTangent = tangents[(index - 2 + tangents.length) % tangents.length];
      const nextTangent = tangents[(index + 2) % tangents.length];
      const sampleDistance = Math.max(1, distances[Math.min(index + 2, distances.length - 1)] - distances[Math.max(0, index - 2)]);
      const curvature = signedAngle(previousTangent, nextTangent) / sampleDistance;
      const bank = clamp(curvature * 21, -0.16, 0.16);
      const flatRight = new Vector3(tangent.z, 0, -tangent.x).normalize();
      const up = new Vector3(Math.sin(bank) * flatRight.x, Math.cos(bank), Math.sin(bank) * flatRight.z).normalize();
      const right = Vector3.Cross(up, tangent).normalize();
      this.samples.push({
        position: positions[index],
        tangent,
        right,
        up,
        distance: distances[index],
        curvature,
        bank,
        u: index / this.segments
      });
    }
  }

  sample(distance: number): TrackSample {
    const wrapped = wrap(distance, this.length);
    let low = 0;
    let high = this.samples.length - 1;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (this.samples[middle].distance <= wrapped) low = middle;
      else high = middle;
    }
    const a = this.samples[low];
    const b = this.samples[Math.min(low + 1, this.samples.length - 1)];
    const span = Math.max(0.0001, b.distance - a.distance);
    const amount = clamp((wrapped - a.distance) / span, 0, 1);
    return {
      position: Vector3.Lerp(a.position, b.position, amount),
      tangent: Vector3.Lerp(a.tangent, b.tangent, amount).normalize(),
      right: Vector3.Lerp(a.right, b.right, amount).normalize(),
      up: Vector3.Lerp(a.up, b.up, amount).normalize(),
      distance: wrapped,
      curvature: lerp(a.curvature, b.curvature, amount),
      bank: lerp(a.bank, b.bank, amount),
      u: lerp(a.u, b.u, amount)
    };
  }

  curvature(distance: number, lookAhead = 18): number {
    const current = this.sample(distance);
    const ahead = this.sample(distance + lookAhead);
    return signedAngle(current.tangent, ahead.tangent) / Math.max(1, lookAhead);
  }

  maximumCurvature(distance: number, offsets = [10, 28, 52, 78]): number {
    let strongest = 0;
    for (const offset of offsets) {
      const value = this.curvature(distance + offset, Math.max(12, offset * 0.34));
      if (Math.abs(value) > Math.abs(strongest)) strongest = value;
    }
    return strongest;
  }

  yaw(distance: number): number {
    const tangent = this.sample(distance).tangent;
    return Math.atan2(tangent.x, tangent.z);
  }
}
